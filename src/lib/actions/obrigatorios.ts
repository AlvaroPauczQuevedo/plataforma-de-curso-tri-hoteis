"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { bloqueioDeCurso, bloqueioDeVinculo } from "@/lib/alcance-admin";
import { sincronizarCurso } from "@/lib/matricula-automatica";
import {
  motivoDePrazoInvalido,
  motivoDeValidadeInvalida,
  resumoDoLote,
  separarObrigatoriedades,
} from "@/lib/obrigatoriedade";
import type { ActionResult } from "@/lib/actions/employees";

/**
 * Marca um curso como obrigatório para um departamento e já matricula todos.
 *
 * Duas travas se somam, e as duas são necessárias: quem faz isso precisa poder
 * alterar o curso (senão marcaria o curso de outro time como obrigatório) e
 * precisa administrar o departamento (senão criaria obrigação para o time dos
 * outros).
 */
export async function tornarObrigatorio(
  courseId: string,
  departmentId: string,
  prazoDias: number | null,
  validadeMeses: number | null = null
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const doCurso = await bloqueioDeCurso(courseId, admin.id);
  if (doCurso) return doCurso;

  const doDepartamento = await bloqueioDeVinculo(admin.id, departmentId);
  if (doDepartamento) return doDepartamento;

  // As mesmas conferências da versão em lote, vindas de `lib/obrigatoriedade`:
  // duas cópias acabariam divergindo, e uma aceitaria o que a outra recusa.
  const prazoRuim = motivoDePrazoInvalido(prazoDias);
  if (prazoRuim) return { ok: false, error: prazoRuim };

  const validadeRuim = motivoDeValidadeInvalida(validadeMeses);
  if (validadeRuim) return { ok: false, error: validadeRuim };

  const existente = await db.cursoObrigatorio.findUnique({
    where: { courseId_departmentId: { courseId, departmentId } },
  });
  if (existente) {
    return { ok: false, error: "Este curso já é obrigatório para este departamento." };
  }

  await db.cursoObrigatorio.create({
    data: { courseId, departmentId, prazoDias, validadeMeses },
  });

  const resultado = await sincronizarCurso(courseId, admin.id);

  const departamento = await db.department.findUnique({ where: { id: departmentId } });
  await logAdminActivity({
    adminId: admin.id,
    action: "CURSO_OBRIGATORIO",
    targetType: "Course",
    targetId: courseId,
    details: `${departamento?.name ?? departmentId} — ${resultado.criadas} matrícula(s) criada(s)`,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/admin/matriculas");
  return {
    ok: true,
    message:
      resultado.criadas > 0
        ? `Curso obrigatório para ${departamento?.name}. ${resultado.criadas} funcionário(s) matriculado(s).`
        : `Curso obrigatório para ${departamento?.name}. Todos já estavam matriculados.`,
  };
}


/**
 * O mesmo, para VÁRIOS setores de uma vez.
 *
 * Nesta rede o departamento é o hotel, então "Brigada de incêndio é
 * obrigatória" eram 25 idas ao formulário — repetidas a cada curso novo.
 * Esquecer uma casa deixa o hotel irregular sem ninguém notar: a Conformidade
 * o mostra em dia, porque ele não deve nada.
 *
 * **Tudo ou nada nas recusas**, como o cadastro de funcionários em lote: se um
 * setor selecionado estiver fora do alcance de quem clicou, nada é gravado.
 * Gravar parte e reclamar do resto deixaria uma lista pela metade para
 * reconciliar à mão.
 *
 * **Mas setor que já era obrigatório é pulado, não recusado.** É pedido já
 * atendido, não erro de validação — ver `separarObrigatoriedades`.
 */
export async function tornarObrigatorioEmLote(
  courseId: string,
  departmentIds: string[],
  prazoDias: number | null,
  validadeMeses: number | null = null
): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (departmentIds.length === 0) {
    return { ok: false, error: "Escolha ao menos um setor." };
  }

  const doCurso = await bloqueioDeCurso(courseId, admin.id);
  if (doCurso) return doCurso;

  const prazoRuim = motivoDePrazoInvalido(prazoDias);
  if (prazoRuim) return { ok: false, error: prazoRuim };

  const validadeRuim = motivoDeValidadeInvalida(validadeMeses);
  if (validadeRuim) return { ok: false, error: validadeRuim };

  /*
    O alcance de CADA setor, antes de gravar qualquer um. A trava é a mesma da
    versão individual; o que muda é que ela roda inteira primeiro — senão os
    primeiros seriam gravados e o lote morreria no meio.
  */
  for (const departmentId of departmentIds) {
    const bloqueio = await bloqueioDeVinculo(admin.id, departmentId);
    if (bloqueio) return bloqueio;
  }

  const jaExistentes = new Set(
    (
      await db.cursoObrigatorio.findMany({
        where: { courseId, departmentId: { in: departmentIds } },
        select: { departmentId: true },
      })
    ).map((o) => o.departmentId)
  );

  const { novos, jaEram } = separarObrigatoriedades(departmentIds, jaExistentes);

  if (novos.length > 0) {
    await db.cursoObrigatorio.createMany({
      data: novos.map((departmentId) => ({ courseId, departmentId, prazoDias, validadeMeses })),
    });
  }

  /*
    Uma sincronização só, no fim. Ela varre os obrigatórios do curso inteiro,
    então chamá-la por setor repetiria o mesmo trabalho N vezes — e com 25
    hotéis isso é 25 varreduras da base de funcionários.
  */
  const resultado =
    novos.length > 0
      ? await sincronizarCurso(courseId, admin.id)
      : { criadas: 0, jaExistiam: 0 };

  await logAdminActivity({
    adminId: admin.id,
    action: "CURSO_OBRIGATORIO_EM_LOTE",
    targetType: "Course",
    targetId: courseId,
    details: `${novos.length} setor(es) novo(s) — ${resultado.criadas} matrícula(s) criada(s)`,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/admin/matriculas");
  revalidatePath("/admin/conformidade");

  return {
    ok: true,
    message: resumoDoLote({
      novos: novos.length,
      jaEram: jaEram.length,
      matriculas: resultado.criadas,
    }),
  };
}

/**
 * Retira a obrigatoriedade — sem desmatricular ninguém.
 *
 * Remover as matrículas junto apagaria progresso e certificados de quem já
 * concluiu. Quem precisa sair do curso é removido individualmente, com
 * confirmação; aqui só deixa de valer para quem entrar daqui em diante.
 */
export async function removerObrigatoriedade(
  courseId: string,
  departmentId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const doCurso = await bloqueioDeCurso(courseId, admin.id);
  if (doCurso) return doCurso;

  await db.cursoObrigatorio.deleteMany({ where: { courseId, departmentId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "REMOVER_OBRIGATORIEDADE",
    targetType: "Course",
    targetId: courseId,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  return {
    ok: true,
    message:
      "Obrigatoriedade removida. Quem já estava matriculado continua — " +
      "remova individualmente se for o caso.",
  };
}
