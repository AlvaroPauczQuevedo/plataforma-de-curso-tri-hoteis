"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import type { ActionResult } from "@/lib/actions/employees";
import { recalculateCourseProgress } from "@/lib/progress";
import { bloqueioDeCurso } from "@/lib/alcance-admin";

export async function enrollUsers(params: {
  courseId: string;
  userIds: string[];
  mandatory: boolean;
  dueDate?: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { courseId, userIds, mandatory, dueDate } = params;

  /*
    A trava é sobre o CURSO, não sobre as pessoas.

    Quem responde por um treinamento precisa poder convocar quem ele quiser —
    um curso de segurança do trabalho serve à empresa inteira, não só ao setor
    de quem o escreveu. Exigir que o aluno fosse do mesmo departamento
    obrigaria a duplicar o mesmo curso em cada setor.

    O que continua barrado é editar a PESSOA: cadastro, senha, departamento e
    ativação seguem restritos a quem administra o setor dela. Matricular
    concede acesso a um conteúdo; não altera dado de ninguém.
  */
  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  if (userIds.length === 0) {
    return { ok: false, error: "Selecione ao menos um funcionário." };
  }

  await db.$transaction(
    userIds.map((userId) =>
      db.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: {
          userId,
          courseId,
          mandatory,
          dueDate: dueDate ? new Date(dueDate) : null,
          assignedById: admin.id,
        },
        update: {
          mandatory,
          dueDate: dueDate ? new Date(dueDate) : null,
        },
      })
    )
  );

  for (const userId of userIds) {
    await recalculateCourseProgress(userId, courseId);
  }

  const course = await db.course.findUnique({ where: { id: courseId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "MATRICULAR",
    targetType: "Course",
    targetId: courseId,
    details: `${course?.title ?? ""} — ${userIds.length} funcionário(s)`,
  });

  revalidatePath("/admin/matriculas");
  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/admin/funcionarios");
  return { ok: true, message: "Matrícula realizada com sucesso." };
}

export async function removeEnrollment(userId: string, courseId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  /*
    Mesma trava da matrícula, pelo mesmo motivo: quem pode convocar precisa
    poder desconvocar, senão um engano vira permanente.

    Vale o alerta, porém: remover apaga progresso e certificado daquela pessoa
    neste curso. É a ação mais destrutiva que um administrador de departamento
    alcança fora do próprio setor.
  */
  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  await db.enrollment.deleteMany({ where: { userId, courseId } });
  await db.courseProgress.deleteMany({ where: { userId, courseId } });
  await db.certificate.deleteMany({ where: { userId, courseId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "REMOVER_MATRICULA",
    targetType: "Course",
    targetId: courseId,
    details: `Funcionário ${userId}`,
  });

  revalidatePath("/admin/matriculas");
  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/admin/funcionarios");
  return { ok: true };
}
