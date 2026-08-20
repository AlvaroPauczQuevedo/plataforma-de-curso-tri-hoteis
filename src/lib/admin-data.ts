import { db } from "@/lib/db";

export async function getDashboardStats() {
  const now = new Date();

  const [
    totalEmployees,
    activeEmployees,
    publishedCourses,
    totalEnrollments,
    courseProgressAll,
    recentActivity,
  ] = await Promise.all([
    db.user.count({ where: { role: "EMPLOYEE" } }),
    db.user.count({ where: { role: "EMPLOYEE", active: true } }),
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.enrollment.count(),
    db.courseProgress.findMany(),
    db.adminActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { admin: true },
    }),
  ]);

  const inProgress = courseProgressAll.filter((p) => p.percent > 0 && p.percent < 100).length;
  const completed = courseProgressAll.filter((p) => p.percent >= 100).length;

  const overdueEnrollments = await db.enrollment.findMany({
    where: {
      dueDate: { lt: now },
    },
    include: { course: true, user: true },
  });
  const overdueUserIds = new Set<string>();
  for (const e of overdueEnrollments) {
    const progress = courseProgressAll.find((p) => p.userId === e.userId && p.courseId === e.courseId);
    if (!progress || progress.percent < 100) {
      overdueUserIds.add(e.userId);
    }
  }

  const avgCompletion =
    courseProgressAll.length === 0
      ? 0
      : Math.round(
          courseProgressAll.reduce((sum, p) => sum + p.percent, 0) / courseProgressAll.length
        );

  const enrollmentsByCourse = await db.enrollment.groupBy({
    by: ["courseId"],
    _count: { courseId: true },
  });
  const courses = await db.course.findMany({
    where: { id: { in: enrollmentsByCourse.map((e) => e.courseId) } },
  });
  const mostAccessed = enrollmentsByCourse
    .map((e) => ({
      course: courses.find((c) => c.id === e.courseId)!,
      count: e._count.courseId,
    }))
    .filter((e) => e.course)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const departmentCounts = await db.department.findMany({
    include: { _count: { select: { users: true } } },
  });

  const statusBreakdown = [
    { name: "Não iniciados", value: totalEnrollments - inProgress - completed, color: "#94a3b8" },
    { name: "Em andamento", value: inProgress, color: "#6366f1" },
    { name: "Concluídos", value: completed, color: "#16a34a" },
  ];

  return {
    totalEmployees,
    activeEmployees,
    publishedCourses,
    totalEnrollments,
    inProgress,
    completed,
    overdueCount: overdueUserIds.size,
    avgCompletion,
    mostAccessed,
    recentActivity,
    departmentCounts: departmentCounts.map((d) => ({ name: d.name, total: d._count.users })),
    statusBreakdown,
  };
}
