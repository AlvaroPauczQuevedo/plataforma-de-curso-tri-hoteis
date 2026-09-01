"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { recalculateCourseProgress } from "@/lib/progress";
import type { ActionResult } from "@/lib/actions/employees";
import {
  corrigir,
  motivoParaNaoPublicar,
  type Respostas,
  type Resultado,
} from "@/lib/prova";
import {
  bloqueioDeProva,
  bloqueioDeQuestao,
  bloqueioDeVinculoDeProva,
  departamentoDoAtor,
  ehProprietario,
} from "@/lib/alcance-admin";

const provaSchema = z.object({
  titulo: z.string().min(3, "Informe o título da prova."),
  descricao: z.string().optional(),
  notaMinima: z.coerce
    .number()
    .int()
    .min(1, "A nota mínima precisa ser maior que zero.")
    .max(100, "A nota mínima não pode passar de 100."),
});

/* ------------------------------------------------------------------- prova */

export async function createProva(formData: FormData): Promise<ActionResult & { provaId?: string }> {
  const admin = await requireAdmin();

  const parsed = provaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    notaMinima: formData.get("notaMinima") || 70,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // A prova nasce no departamento de quem a cria, como acontece com o curso.
  const departmentId = await departamentoDoAtor(admin.id);
  const vinculo = await bloqueioDeVinculoDeProva(admin.id, departmentId);
  if (vinculo) return vinculo;

  const prova = await db.prova.create({
    data: { ...parsed.data, departmentId, createdById: admin.id },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_PROVA",
    targetType: "Prova",
    targetId: prova.id,
    details: prova.titulo,
  });

  revalidatePath("/admin/provas");
  return { ok: true, provaId: prova.id };
}

export async function updateProva(provaId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeProva(provaId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = provaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    notaMinima: formData.get("notaMinima") || 70,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  /*
    Só o proprietário escolhe o departamento de uma prova; para os demais o
    campo nem aparece. Ler o campo ausente como nulo seria interpretá-lo como
    "mover para nenhum departamento" — o mesmo defeito que já apareceu no
    curso e travava qualquer alteração.
  */
  const proprietario = await ehProprietario(admin.id);
  const atual = await db.prova.findUnique({
    where: { id: provaId },
    select: { departmentId: true },
  });

  const destino = proprietario
    ? (formData.get("departmentId") as string) || null
    : (atual?.departmentId ?? null);

  const vinculo = await bloqueioDeVinculoDeProva(admin.id, destino);
  if (vinculo) return vinculo;

  await db.prova.update({
    where: { id: provaId },
    data: { ...parsed.data, departmentId: destino },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "EDITAR_PROVA",
    targetType: "Prova",
    targetId: provaId,
  });

  revalidatePath("/admin/provas");
  revalidatePath(`/admin/provas/${provaId}`);
  return { ok: true, message: "Prova atualizada." };
}

export async function deleteProva(provaId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeProva(provaId, admin.id);
  if (bloqueio) return bloqueio;

  /*
    Excluir prova apaga as tentativas junto, em cascata — ou seja, apaga a nota
    que funcionários já tiraram. Prova com histórico é registro de avaliação, e
    registro de avaliação não se joga fora sem querer.

    Por isso a recusa: com tentativa registrada, o caminho é despublicar. A
    prova some da vista do funcionário e o histórico continua existindo.
  */
  const tentativas = await db.tentativaProva.count({ where: { provaId } });
  if (tentativas > 0) {
    return {
      ok: false,
      error:
        `Esta prova já foi realizada ${tentativas} vez(es) e não pode ser excluída — ` +
        "as notas seriam apagadas junto. Despublique-a para tirá-la de circulação.",
    };
  }

  const prova = await db.prova.delete({ where: { id: provaId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_PROVA",
    targetType: "Prova",
    targetId: provaId,
    details: prova.titulo,
  });

  revalidatePath("/admin/provas");
  return { ok: true };
}

export async function setProvaPublicada(
  provaId: string,
  publicada: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeProva(provaId, admin.id);
  if (bloqueio) return bloqueio;

  if (publicada) {
    const questoes = await db.questaoProva.findMany({
      where: { provaId },
      include: { alternativas: true },
    });

    const motivo = motivoParaNaoPublicar(questoes);
    if (motivo) return { ok: false, error: motivo };
  }

  await db.prova.update({ where: { id: provaId }, data: { publicada } });

  await logAdminActivity({
    adminId: admin.id,
    action: publicada ? "PUBLICAR_PROVA" : "DESPUBLICAR_PROVA",
    targetType: "Prova",
    targetId: provaId,
  });

  revalidatePath("/admin/provas");
  revalidatePath(`/admin/provas/${provaId}`);
  return { ok: true };
}

/* ----------------------------------------------------------------- questão */

const questaoSchema = z.object({
  enunciado: z.string().min(3, "Informe o enunciado da questão."),
  alternativas: z
    .array(z.string().min(1, "Alternativa em branco."))
    .min(2, "Informe ao menos duas alternativas."),
  corretaIndice: z.coerce.number().int().min(0),
});

export async function addQuestao(provaId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeProva(provaId, admin.id);
  if (bloqueio) return bloqueio;

  const alternativas = formData
    .getAll("alternativa")
    .map((a) => String(a).trim())
    .filter(Boolean);

  const parsed = questaoSchema.safeParse({
    enunciado: formData.get("enunciado"),
    alternativas,
    corretaIndice: formData.get("corretaIndice") ?? 0,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  if (parsed.data.corretaIndice >= alternativas.length) {
    return { ok: false, error: "Marque qual alternativa é a correta." };
  }

  const ultima = await db.questaoProva.findFirst({
    where: { provaId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  await db.questaoProva.create({
    data: {
      provaId,
      enunciado: parsed.data.enunciado,
      ordem: (ultima?.ordem ?? -1) + 1,
      alternativas: {
        create: parsed.data.alternativas.map((texto, i) => ({
          texto,
          ordem: i,
          correta: i === parsed.data.corretaIndice,
        })),
      },
    },
  });

  revalidatePath(`/admin/provas/${provaId}`);
  return { ok: true, message: "Questão adicionada." };
}

export async function deleteQuestao(questaoId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeQuestao(questaoId, admin.id);
  if (bloqueio) return bloqueio;

  const questao = await db.questaoProva.delete({ where: { id: questaoId } });

  /*
    Excluir questão mexe na nota de todo mundo que ainda vai fazer a prova,
    e antes disto sumia sem deixar rastro: o histórico registrava criar,
    editar, publicar e excluir a prova, mas não o que ela pergunta. Quem
    auditasse uma nota estranha não teria como saber que o gabarito mudou.

    O enunciado vai no registro porque a questão já não existe para ser
    consultada depois.
  */
  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_QUESTAO",
    targetType: "Prova",
    targetId: questao.provaId,
    details: questao.enunciado,
  });

  revalidatePath(`/admin/provas/${questao.provaId}`);
  return { ok: true };
}

/* -------------------------------------------------------------- tentativa */

/**
 * Registra a realização de uma prova por um funcionário.
 *
 * A correção acontece no servidor, com o gabarito lido do banco. Corrigir no
 * navegador exigiria mandar as respostas certas para lá — e aí a prova não
 * avaliaria nada.
 */
export async function submeterTentativa(
  provaId: string,
  respostas: Respostas
): Promise<ActionResult & { resultado?: Resultado }> {
  const usuario = await requireUser();

  const prova = await db.prova.findUnique({
    where: { id: provaId },
    include: {
      questoes: { include: { alternativas: true }, orderBy: { ordem: "asc" } },
    },
  });

  if (!prova) return { ok: false, error: "Prova não encontrada." };
  if (!prova.publicada) return { ok: false, error: "Esta prova não está disponível." };

  /*
    Alcance do funcionário: prova do departamento dele, ou prova sem
    departamento — que é a prova geral, escrita pelo proprietário para toda a
    empresa. Sem esta checagem, bastaria conhecer o endereço para responder a
    prova de outro setor.
  */
  const conta = await db.user.findUnique({
    where: { id: usuario.id },
    select: { departmentId: true },
  });

  /*
    Duas portas levam à mesma prova, e as duas valem:

     - a prova é geral, ou é do departamento da pessoa;
     - ou a prova é aula de um curso em que ela está matriculada.

    A segunda existe porque matrícula atravessa departamento: um curso do
    Trainee pode ter alunos de outro setor, e a prova daquele curso precisa
    valer para eles. Sem isso, a pessoa veria a prova na aula e tomaria recusa
    ao entregar.
  */
  const porDepartamento =
    prova.departmentId === null || prova.departmentId === conta?.departmentId;

  const porCurso =
    porDepartamento ||
    (await db.lesson.count({
      where: {
        provaId,
        module: { course: { enrollments: { some: { userId: usuario.id } } } },
      },
    })) > 0;

  if (!porCurso) {
    return { ok: false, error: "Esta prova não está liberada para você." };
  }

  const resultado = corrigir(prova.questoes, respostas, prova.notaMinima);

  const tentativa = await db.tentativaProva.create({
    data: {
      provaId,
      userId: usuario.id,
      nota: resultado.nota,
      acertos: resultado.acertos,
      total: resultado.total,
      aprovado: resultado.aprovado,
      respostas: JSON.stringify(resultado.questoes),
    },
  });

  /*
    Aprovação conclui a aula de prova, onde quer que ela esteja.

    A busca é pelas aulas que apontam para esta prova, e só nos cursos em que
    a pessoa está matriculada. Assim tanto faz onde ela respondeu — pelo curso
    ou pela lista de provas: passar é passar, e a aula não fica pendente por
    causa do caminho que ela escolheu.

    Reprovação não desfaz aprovação anterior de propósito. Quem já passou não
    perde a conclusão por tentar de novo e ir pior.
  */
  if (resultado.aprovado) {
    const aulas = await db.lesson.findMany({
      where: {
        provaId,
        module: { course: { enrollments: { some: { userId: usuario.id } } } },
      },
      select: { id: true, module: { select: { courseId: true } } },
    });

    for (const aula of aulas) {
      await db.lessonProgress.upsert({
        where: { userId_lessonId: { userId: usuario.id, lessonId: aula.id } },
        create: {
          userId: usuario.id,
          lessonId: aula.id,
          completed: true,
          completedAt: tentativa.createdAt,
        },
        update: { completed: true, completedAt: tentativa.createdAt },
      });

      await recalculateCourseProgress(usuario.id, aula.module.courseId);
      revalidatePath(`/cursos/${aula.module.courseId}`);
    }
  }

  revalidatePath("/provas");
  revalidatePath(`/provas/${provaId}`);
  return { ok: true, resultado };
}
