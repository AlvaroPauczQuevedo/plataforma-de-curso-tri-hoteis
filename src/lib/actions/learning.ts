"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { recalculateCourseProgress } from "@/lib/progress";
import { isLessonUnlocked } from "@/lib/access";
import type { ActionResult } from "@/lib/actions/employees";

export async function markLessonComplete(lessonId: string): Promise<ActionResult> {
  const user = await requireUser();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return { ok: false, error: "Aula não encontrada." };

  const courseId = lesson.module.courseId;

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrollment) return { ok: false, error: "Você não está matriculado neste curso." };

  const unlocked = await isLessonUnlocked(user.id, lessonId);
  if (!unlocked) {
    return { ok: false, error: "Conclua as aulas anteriores primeiro." };
  }

  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: {
      userId: user.id,
      lessonId,
      completed: true,
      completedAt: new Date(),
    },
    update: {
      completed: true,
      completedAt: new Date(),
    },
  });

  await recalculateCourseProgress(user.id, courseId);

  revalidatePath(`/cursos/${courseId}`);
  revalidatePath(`/cursos/${courseId}/aulas/${lessonId}`);
  revalidatePath("/");
  revalidatePath("/meus-cursos");
  return { ok: true };
}

export async function updateVideoProgress(
  lessonId: string,
  positionSeconds: number,
  watchedPercent: number,
  thresholdPercent: number
): Promise<ActionResult> {
  const user = await requireUser();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return { ok: false, error: "Aula não encontrada." };

  const courseId = lesson.module.courseId;

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrollment) return { ok: false, error: "Sem permissão." };

  const shouldComplete = watchedPercent >= thresholdPercent;

  const existing = await db.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });

  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: {
      userId: user.id,
      lessonId,
      videoPositionSeconds: Math.floor(positionSeconds),
      videoWatchedPercent: Math.floor(watchedPercent),
      completed: shouldComplete,
      completedAt: shouldComplete ? new Date() : null,
    },
    update: {
      videoPositionSeconds: Math.floor(positionSeconds),
      videoWatchedPercent: Math.max(
        Math.floor(watchedPercent),
        existing?.videoWatchedPercent ?? 0
      ),
      completed: shouldComplete || existing?.completed || false,
      completedAt: shouldComplete && !existing?.completed ? new Date() : existing?.completedAt,
    },
  });

  if (shouldComplete && !existing?.completed) {
    await recalculateCourseProgress(user.id, courseId);
    revalidatePath(`/cursos/${courseId}`);
    revalidatePath("/");
    revalidatePath("/meus-cursos");
  }

  return { ok: true };
}
