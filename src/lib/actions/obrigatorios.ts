"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { bloqueioDeCurso, bloqueioDeVinculo } from "@/lib/alcance-admin";
import { sincronizarCurso, sincronizarTudo } from "@/lib/matricula-automatica";
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
  prazoDias: number | null
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const doCurso = await bloqueioDeCurso(courseId, admin.id);
  if (doCurso) return doCurso;

  const doDepartamento = await bloqueioDeVinculo(admin.id, departmentId);
  if (doDepartamento) return doDepartamento;

  if (prazoDias !== null && (!Number.isInteger(prazoDias) || prazoDias < 1)) {
    return { ok: false, error: "O prazo deve ser um número de dias maior que zero." };
  }

  const existente = await db.cursoObrigatorio.findUnique({
    where: { courseId_departmentId: { courseId, departmentId } },
  });
  if (existente) {
    return { ok: false, error: "Este curso já é obrigatório para este departamento." };
  }

  await db.cursoObrigatorio.create({ data: { courseId, departmentId, prazoDias } });

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

/** Recria as matrículas obrigatórias que estiverem faltando na plataforma toda. */
export async function sincronizarObrigatorios(): Promise<ActionResult> {
  const admin = await requireAdmin();

  const resultado = await sincronizarTudo(admin.id);

  revalidatePath("/admin/matriculas");
  return {
    ok: true,
    message:
      resultado.criadas > 0
        ? `${resultado.criadas} matrícula(s) criada(s).`
        : "Nada a fazer: todas as matrículas obrigatórias já existem.",
  };
}
