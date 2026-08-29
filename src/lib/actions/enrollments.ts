"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import type { ActionResult } from "@/lib/actions/employees";
import { recalculateCourseProgress } from "@/lib/progress";
import {
  bloqueioDeAlteracao,
  bloqueioDeAlteracaoEmLote,
} from "@/lib/alcance-admin";

export async function enrollUsers(params: {
  courseId: string;
  userIds: string[];
  mandatory: boolean;
  dueDate?: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { courseId, userIds, mandatory, dueDate } = params;

  // Matricular altera o histórico da pessoa: vale o mesmo alcance do cadastro.
  const bloqueio = await bloqueioDeAlteracaoEmLote(userIds, admin.id);
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

  // Remover apaga progresso e certificado — mais destrutivo que editar o cadastro.
  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
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
