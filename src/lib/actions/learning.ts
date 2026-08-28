"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { recalculateCourseProgress } from "@/lib/progress";
import { isLessonUnlocked } from "@/lib/access";
import { readVideoDurationSeconds } from "@/lib/video-duration";
import type { ActionResult } from "@/lib/actions/employees";

/** Tolerância para reprodução acelerada (até 2x) e atrasos de rede. */
const SPEED_TOLERANCE = 2;
/**
 * Crédito máximo por heartbeat. O player envia a cada 4s; o teto evita que uma
 * aba deixada aberta em segundo plano acumule tempo de uma só vez.
 */
const MAX_CREDIT_PER_HEARTBEAT = 30;
/** Crédito do primeiro heartbeat, quando ainda não há intervalo a medir. */
const FIRST_HEARTBEAT_CREDIT_SECONDS = 5;
/** Tempo mínimo exigido quando a duração do vídeo não pôde ser lida. */
const FALLBACK_REQUIRED_SECONDS = 60;

export async function markLessonComplete(lessonId: string): Promise<ActionResult> {
  const user = await requireUser();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return { ok: false, error: "Aula não encontrada." };

  // Vídeos hospedados na plataforma só concluem pelo tempo assistido. O botão
  // manual existe apenas para vídeos incorporados (iframe), onde não é
  // possível medir a reprodução, e para PDF/texto.
  if (lesson.type === "VIDEO" && lesson.videoSource === "UPLOAD") {
    return {
      ok: false,
      error: "Esta aula é concluída automaticamente ao assistir o vídeo.",
    };
  }

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

/**
 * Registra o avanço da reprodução de um vídeo.
 *
 * O percentual informado pelo navegador é apenas uma *proposta*: o limite de
 * conclusão vem sempre do curso no banco (nunca do cliente) e o ganho por
 * chamada é limitado pelo tempo real decorrido desde o heartbeat anterior.
 * Assim, concluir um vídeo exige gastar, de fato, o tempo do vídeo — abrir a
 * página ou avançar a barra até o fim não conclui a aula.
 */
export async function updateVideoProgress(
  lessonId: string,
  positionSeconds: number,
  watchedPercent: number
): Promise<ActionResult> {
  const user = await requireUser();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } }, videoFile: true },
  });
  if (!lesson) return { ok: false, error: "Aula não encontrada." };

  const courseId = lesson.module.courseId;

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrollment) return { ok: false, error: "Sem permissão." };

  const unlocked = await isLessonUnlocked(user.id, lessonId);
  if (!unlocked) return { ok: false, error: "Conclua as aulas anteriores primeiro." };

  // O limite de conclusão é o que o administrador configurou no curso.
  const thresholdPercent = lesson.module.course.videoCompletionThreshold;

  // Sanitiza o que veio do navegador — é uma proposta, não uma verdade.
  const reportedPercent = Math.min(100, Math.max(0, Math.floor(watchedPercent) || 0));
  const safePosition = Math.max(0, Math.floor(positionSeconds) || 0);

  // A duração vem do próprio arquivo de vídeo e é guardada na primeira
  // reprodução. Nunca do cliente: um vídeo declarado com 1 segundo permitiria
  // concluir instantaneamente uma aula de meia hora.
  let duration = lesson.videoDurationSeconds ?? 0;
  if (!duration && lesson.videoFile) {
    const lida = await readVideoDurationSeconds(lesson.videoFile.storagePath);
    if (lida && lida > 0) {
      duration = lida;
      await db.lesson.update({
        where: { id: lessonId },
        data: { videoDurationSeconds: duration },
      });
    }
  }

  const existing = await db.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });

  // O tempo assistido é creditado pelo menor entre dois limites independentes:
  //  - o relógio do SERVIDOR desde o último heartbeat (com folga para 2x),
  //    que impede acumular mais rápido do que o vídeo dura; e
  //  - o avanço real do ponteiro do vídeo, que impede ganhar tempo com a
  //    página aberta e parada.
  // Arrastar a barra até o fim falha no primeiro; deixar a aba aberta falha
  // no segundo. Assistir de verdade satisfaz os dois.
  const elapsedSeconds = existing
    ? (Date.now() - existing.updatedAt.getTime()) / 1000
    : FIRST_HEARTBEAT_CREDIT_SECONDS;
  const avancoDoVideo = safePosition - (existing?.videoPositionSeconds ?? 0);
  const credito = Math.max(
    0,
    Math.min(
      elapsedSeconds * SPEED_TOLERANCE,
      avancoDoVideo,
      MAX_CREDIT_PER_HEARTBEAT
    )
  );
  const watchedSeconds = (existing?.videoWatchedSeconds ?? 0) + credito;

  const requiredSeconds =
    duration > 0 ? (duration * thresholdPercent) / 100 : FALLBACK_REQUIRED_SECONDS;

  // O percentual exibido também é limitado pelo tempo efetivamente assistido.
  const percentPorTempo = duration > 0 ? (watchedSeconds / duration) * 100 : reportedPercent;
  const effectivePercent = Math.min(
    100,
    Math.max(
      existing?.videoWatchedPercent ?? 0,
      Math.min(reportedPercent, Math.round(percentPorTempo))
    )
  );

  const alreadyCompleted = existing?.completed ?? false;
  const shouldComplete =
    alreadyCompleted ||
    (reportedPercent >= thresholdPercent && watchedSeconds >= requiredSeconds);

  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: {
      userId: user.id,
      lessonId,
      videoPositionSeconds: safePosition,
      videoWatchedPercent: Math.floor(effectivePercent),
      videoWatchedSeconds: Math.floor(watchedSeconds),
      completed: shouldComplete,
      completedAt: shouldComplete ? new Date() : null,
    },
    update: {
      videoPositionSeconds: safePosition,
      videoWatchedPercent: Math.floor(effectivePercent),
      videoWatchedSeconds: Math.floor(watchedSeconds),
      completed: shouldComplete,
      completedAt: shouldComplete ? existing?.completedAt ?? new Date() : null,
    },
  });

  if (shouldComplete && !alreadyCompleted) {
    await recalculateCourseProgress(user.id, courseId);
    revalidatePath(`/cursos/${courseId}`);
    revalidatePath("/");
    revalidatePath("/meus-cursos");
  }

  return { ok: true, message: shouldComplete ? "completed" : undefined };
}
