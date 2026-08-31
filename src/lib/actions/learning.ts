"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { recalculateCourseProgress } from "@/lib/progress";
import { isLessonUnlocked } from "@/lib/access";
import { readVideoDurationSeconds } from "@/lib/video-duration";
import { calcularCredito } from "@/lib/video-credito";
import type { ActionResult } from "@/lib/actions/employees";

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

  /*
    Aula de prova conclui por aprovação, nunca por clique. Permitir o botão
    manual aqui esvaziaria a avaliação: bastaria abrir e marcar como feita.
  */
  if (lesson.type === "PROVA") {
    return {
      ok: false,
      error: "Esta aula é concluída ao ser aprovado na prova.",
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

  // A regra de crédito vive em lib/video-credito.ts, como função pura: é o que
  // impede forjar a conclusão, e é a única parte do fluxo cujo resultado
  // depende do relógio. Separada, dá para exercitá-la em teste sem esperar.
  const credito = calcularCredito({
    agora: new Date(),
    anterior: existing
      ? {
          posicaoSegundos: existing.videoPositionSeconds ?? 0,
          percentual: existing.videoWatchedPercent ?? 0,
          segundosAssistidos: existing.videoWatchedSeconds,
          concluida: existing.completed,
          atualizadoEm: existing.updatedAt,
        }
      : null,
    posicaoSegundos: safePosition,
    percentualProposto: reportedPercent,
    duracaoSegundos: duration,
    limiarPercentual: thresholdPercent,
  });

  const watchedSeconds = credito.segundosAssistidos;
  const effectivePercent = credito.percentual;

  const alreadyCompleted = existing?.completed ?? false;
  const shouldComplete = credito.concluir;

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
