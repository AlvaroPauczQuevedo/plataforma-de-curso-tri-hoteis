import { db } from "@/lib/db";

export async function getEnrollmentsWithProgress(userId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          category: true,
          coverFile: true,
          modules: { include: { lessons: true }, orderBy: { order: "asc" } },
        },
      },
    },
  });

  const progresses = await db.courseProgress.findMany({ where: { userId } });
  const progressByCourse = new Map(progresses.map((p) => [p.courseId, p]));

  const now = new Date();

  return enrollments.map((enrollment) => {
    const progress = progressByCourse.get(enrollment.courseId);
    const percent = progress?.percent ?? 0;
    const completed = percent >= 100;
    const overdue = Boolean(
      enrollment.dueDate && !completed && new Date(enrollment.dueDate) < now
    );
    const totalRequiredLessons = enrollment.course.modules
      .flatMap((m) => m.lessons)
      .filter((l) => l.required).length;

    return {
      enrollment,
      course: enrollment.course,
      percent,
      completed,
      completedAt: progress?.completedAt ?? null,
      overdue,
      totalRequiredLessons,
      lastUpdatedAt: progress?.updatedAt ?? enrollment.assignedAt,
    };
  });
}

export async function getEmployeeDashboard(userId: string) {
  const items = await getEnrollmentsWithProgress(userId);

  const inProgress = items
    .filter((i) => i.percent > 0 && !i.completed)
    .sort((a, b) => (b.lastUpdatedAt > a.lastUpdatedAt ? 1 : -1));

  const notStarted = items.filter((i) => i.percent === 0 && !i.completed);

  const upcomingDeadlines = items
    .filter((i) => i.enrollment.mandatory && !i.completed && i.enrollment.dueDate)
    .sort((a, b) => {
      const da = a.enrollment.dueDate ? new Date(a.enrollment.dueDate).getTime() : 0;
      const db_ = b.enrollment.dueDate ? new Date(b.enrollment.dueDate).getTime() : 0;
      return da - db_;
    });

  const recentlyCompleted = items
    .filter((i) => i.completed)
    .sort((a, b) => {
      const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const db_ = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return db_ - da;
    });

  const overallPercent =
    items.length === 0
      ? 0
      : Math.round(items.reduce((sum, i) => sum + i.percent, 0) / items.length);

  const continueItem = inProgress[0] ?? notStarted[0] ?? null;
  let continueLessonId: string | null = null;
  if (continueItem) {
    continueLessonId = await getNextLessonId(userId, continueItem.course.id);
  }

  return {
    items,
    inProgress,
    notStarted,
    upcomingDeadlines,
    recentlyCompleted,
    overallPercent,
    continueItem,
    continueLessonId,
  };
}

/** Retorna a próxima aula não concluída de um curso (respeitando a ordem de módulos/aulas). */
export async function getNextLessonId(userId: string, courseId: string) {
  const modules = await db.module.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  const lessons = modules.flatMap((m) => m.lessons);
  if (lessons.length === 0) return null;

  const completedProgress = await db.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessons.map((l) => l.id) }, completed: true },
  });
  const completedIds = new Set(completedProgress.map((p) => p.lessonId));

  const next = lessons.find((l) => !completedIds.has(l.id));
  return (next ?? lessons[lessons.length - 1]).id;
}

export async function getHistory(userId: string) {
  const lessonProgress = await db.lessonProgress.findMany({
    where: { userId, completed: true },
    include: {
      lesson: {
        include: { module: { include: { course: true } } },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  const accessLogs = await db.accessLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return { lessonProgress, accessLogs };
}
