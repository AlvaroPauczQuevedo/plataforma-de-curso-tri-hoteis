import { db } from "@/lib/db";

export async function userHasCourseAccess(userId: string, courseId: string) {
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  return Boolean(enrollment);
}

/**
 * Verifica se uma aula está liberada para o usuário considerando a regra de
 * ordem obrigatória (sequential) do curso: todas as aulas anteriores do
 * curso (por módulo/ordem) precisam estar concluídas.
 */
export async function isLessonUnlocked(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return false;

  const course = lesson.module.course;
  if (!course.sequential) return true;

  const modules = await db.module.findMany({
    where: { courseId: course.id },
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" } } },
  });

  const orderedLessons = modules.flatMap((m) => m.lessons);
  const currentIndex = orderedLessons.findIndex((l) => l.id === lessonId);
  if (currentIndex <= 0) return true;

  const previousLessons = orderedLessons.slice(0, currentIndex).filter((l) => l.required);
  if (previousLessons.length === 0) return true;

  const completed = await db.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: previousLessons.map((l) => l.id) },
      completed: true,
    },
  });

  return completed.length === previousLessons.length;
}

export async function fileBelongsToAccessibleCourse(userId: string, fileId: string, isAdmin: boolean) {
  if (isAdmin) return true;

  const lessonWithVideo = await db.lesson.findFirst({
    where: { videoFileId: fileId },
    include: { module: true },
  });
  const lessonWithPdf = await db.lesson.findFirst({
    where: { pdfFileId: fileId },
    include: { module: true },
  });
  const courseWithCover = await db.course.findFirst({ where: { coverFileId: fileId } });

  const lesson = lessonWithVideo ?? lessonWithPdf;
  if (lesson) {
    return userHasCourseAccess(userId, lesson.module.courseId);
  }

  if (courseWithCover) {
    // capas de curso são visíveis para qualquer usuário autenticado (catálogo)
    return true;
  }

  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (file?.kind === "AVATAR") return true;

  return false;
}
