import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";

export default async function RelatoriosPage() {
  await requireAdmin();

  const courses = await db.course.findMany({
    include: {
      enrollments: true,
      _count: { select: { enrollments: true } },
    },
    orderBy: { title: "asc" },
  });

  const progresses = await db.courseProgress.findMany();
  const now = new Date();

  const courseReport = courses.map((course) => {
    const courseProgresses = progresses.filter((p) => p.courseId === course.id);
    const total = course.enrollments.length;
    const completed = courseProgresses.filter((p) => p.percent >= 100).length;
    const inProgress = courseProgresses.filter((p) => p.percent > 0 && p.percent < 100).length;
    const overdue = course.enrollments.filter((e) => {
      const progress = courseProgresses.find((p) => p.userId === e.userId);
      return e.dueDate && (!progress || progress.percent < 100) && new Date(e.dueDate) < now;
    }).length;
    const avgPercent =
      courseProgresses.length === 0
        ? 0
        : Math.round(courseProgresses.reduce((sum, p) => sum + p.percent, 0) / courseProgresses.length);

    return { course, total, completed, inProgress, overdue, avgPercent };
  });

  const departments = await db.department.findMany({
    include: {
      users: {
        where: { role: "EMPLOYEE" },
        include: { courseProgress: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const departmentReport = departments.map((dept) => {
    const allProgress = dept.users.flatMap((u) => u.courseProgress);
    const avgPercent =
      allProgress.length === 0
        ? 0
        : Math.round(allProgress.reduce((sum, p) => sum + p.percent, 0) / allProgress.length);
    return { department: dept, totalEmployees: dept.users.length, avgPercent };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Relatórios de progresso</h1>
        <p className="text-sm text-navy-700/70">Visão consolidada de conclusão por curso e por departamento.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-navy-900">Por curso</h2>
        {courseReport.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum curso cadastrado" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-navy-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Curso</th>
                    <th className="px-4 py-3 font-medium">Matrículas</th>
                    <th className="px-4 py-3 font-medium">Em andamento</th>
                    <th className="px-4 py-3 font-medium">Concluídos</th>
                    <th className="px-4 py-3 font-medium">Atrasados</th>
                    <th className="px-4 py-3 font-medium">Conclusão média</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {courseReport.map((r) => (
                    <tr key={r.course.id} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3 font-medium text-navy-900">{r.course.title}</td>
                      <td className="px-4 py-3 text-navy-700">{r.total}</td>
                      <td className="px-4 py-3 text-navy-700">{r.inProgress}</td>
                      <td className="px-4 py-3 text-navy-700">{r.completed}</td>
                      <td className="px-4 py-3">
                        {r.overdue > 0 ? <Badge tone="danger">{r.overdue}</Badge> : <span className="text-navy-700/50">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={r.avgPercent} size="sm" className="w-28" />
                          <span className="text-xs text-navy-700/60">{r.avgPercent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-navy-900">Por departamento</h2>
        {departmentReport.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum departamento cadastrado" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-navy-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Departamento</th>
                    <th className="px-4 py-3 font-medium">Funcionários</th>
                    <th className="px-4 py-3 font-medium">Conclusão média</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {departmentReport.map((r) => (
                    <tr key={r.department.id} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3 font-medium text-navy-900">{r.department.name}</td>
                      <td className="px-4 py-3 text-navy-700">{r.totalEmployees}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={r.avgPercent} size="sm" className="w-28" />
                          <span className="text-xs text-navy-700/60">{r.avgPercent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
