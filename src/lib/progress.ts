import { db } from "@/lib/db";
import { randomCode } from "@/lib/utils";

/**
 * Recalcula o progresso de um curso para um usuário com base nas aulas
 * obrigatórias concluídas, atualiza o cache CourseProgress e emite
 * certificado automaticamente quando o curso é concluído (se habilitado).
 */
export async function recalculateCourseProgress(userId: string, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        include: { lessons: true },
      },
    },
  });

  if (!course) return null;

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const requiredLessons = allLessons.filter((l) => l.required);

  const progressRecords = await db.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: requiredLessons.map((l) => l.id) },
      completed: true,
    },
  });

  const completedCount = progressRecords.length;
  const total = requiredLessons.length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const isComplete = total > 0 && completedCount === total;

  const existing = await db.courseProgress.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });

  const courseProgress = await db.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: {
      userId,
      courseId,
      percent,
      completedAt: isComplete ? new Date() : null,
    },
    update: {
      percent,
      completedAt: isComplete
        ? existing?.completedAt ?? new Date()
        : null,
    },
  });

  if (isComplete && course.certificateEnabled) {
    await db.certificate.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: {
        userId,
        courseId,
        code: randomCode("CERT"),
      },
      update: {},
    });
  }

  return {
    courseProgress,
    completedCount,
    total,
    isComplete,
  };
}

/**
 * Refaz o progresso de todo mundo matriculado no curso.
 *
 * O percentual mora em CourseProgress e só era refeito quando alguém mexia
 * numa aula. Mas mudar a ESTRUTURA do curso muda o denominador de quem já
 * estava matriculado: acrescentar uma aula obrigatória, tornar opcional uma
 * que era exigida, apagar um módulo inteiro. Sem esta varredura, essas
 * pessoas ficam com o número antigo — alguém marcado "100% concluído", com
 * certificado emitido, num curso que acabou de ganhar uma prova obrigatória
 * que ele nunca fez. O certificado é a peça que a auditoria olha, então o
 * número não pode ficar para trás da regra.
 *
 * Em série de propósito: são muitas escritas no SQLite e mudança de
 * estrutura é rara, então vale mais não disputar o banco do que terminar
 * alguns milissegundos antes.
 */
export async function ressincronizarProgressoDoCurso(courseId: string) {
  const matriculados = await db.enrollment.findMany({
    where: { courseId },
    select: { userId: true },
  });

  for (const { userId } of matriculados) {
    await recalculateCourseProgress(userId, courseId);
  }

  return matriculados.length;
}

export function courseCounters(
  allLessons: { id: string; required: boolean }[],
  completedLessonIds: Set<string>
) {
  const required = allLessons.filter((l) => l.required);
  const completed = required.filter((l) => completedLessonIds.has(l.id));
  return {
    totalRequired: required.length,
    completedRequired: completed.length,
    remaining: required.length - completed.length,
  };
}
