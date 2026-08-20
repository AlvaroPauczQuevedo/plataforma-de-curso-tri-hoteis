import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { BulkEnrollForm } from "@/components/admin/bulk-enroll-form";
import { ActionButton } from "@/components/shared/action-button";
import { SelectFilter } from "@/components/admin/table-filters";
import { removeEnrollment } from "@/lib/actions/enrollments";
import { formatDate } from "@/lib/utils";

export default async function MatriculasPage({
  searchParams,
}: {
  searchParams: { curso?: string; status?: string };
}) {
  await requireAdmin();

  const [employees, courses] = await Promise.all([
    db.user.findMany({
      where: { role: "EMPLOYEE", active: true },
      include: { department: true },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({ where: { status: "PUBLISHED" }, orderBy: { title: "asc" } }),
  ]);

  const enrollments = await db.enrollment.findMany({
    where: searchParams.curso ? { courseId: searchParams.curso } : {},
    include: { user: true, course: true },
    orderBy: { assignedAt: "desc" },
  });

  const progresses = await db.courseProgress.findMany();
  const progressMap = new Map(progresses.map((p) => [`${p.userId}:${p.courseId}`, p]));
  const now = new Date();

  const enriched = enrollments.map((e) => {
    const progress = progressMap.get(`${e.userId}:${e.courseId}`);
    const percent = progress?.percent ?? 0;
    const completed = percent >= 100;
    const overdue = Boolean(e.dueDate && !completed && new Date(e.dueDate) < now);
    const status = completed ? "completed" : overdue ? "overdue" : percent > 0 ? "in_progress" : "not_started";
    return { ...e, percent, completed, overdue, status };
  });

  const filtered = searchParams.status ? enriched.filter((e) => e.status === searchParams.status) : enriched;

  const statusBadge = {
    not_started: <Badge tone="neutral">Não iniciado</Badge>,
    in_progress: <Badge tone="accent">Em andamento</Badge>,
    overdue: <Badge tone="danger">Atrasado</Badge>,
    completed: <Badge tone="success">Concluído</Badge>,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Matrículas</h1>
        <p className="text-sm text-ink-700/70">Libere cursos para um ou vários funcionários de uma vez.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold text-ink-900">Nova matrícula em massa</h2>
        <BulkEnrollForm employees={employees} courses={courses} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink-900">Matrículas existentes ({filtered.length})</h2>
          <Suspense>
            <div className="flex gap-3">
              <SelectFilter
                paramKey="curso"
                placeholder="Todos os cursos"
                options={courses.map((c) => ({ value: c.id, label: c.title }))}
              />
              <SelectFilter
                paramKey="status"
                placeholder="Todos os status"
                options={[
                  { value: "not_started", label: "Não iniciado" },
                  { value: "in_progress", label: "Em andamento" },
                  { value: "overdue", label: "Atrasado" },
                  { value: "completed", label: "Concluído" },
                ]}
              />
            </div>
          </Suspense>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma matrícula encontrada" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Funcionário</th>
                    <th className="px-4 py-3 font-medium">Curso</th>
                    <th className="px-4 py-3 font-medium">Progresso</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Prazo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900">{e.user.name}</p>
                        <p className="text-xs text-ink-700/50">{e.user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-700">
                        {e.course.title}
                        {e.mandatory && <Badge tone="navy" className="ml-2">Obrigatório</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={e.percent} size="sm" className="w-24" />
                          <span className="text-xs text-ink-700/60">{e.percent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge[e.status as keyof typeof statusBadge]}</td>
                      <td className="px-4 py-3 text-xs text-ink-700/60">{formatDate(e.dueDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <ActionButton
                          action={removeEnrollment.bind(null, e.userId, e.courseId)}
                          variant="ghost"
                          size="sm"
                          confirmMessage="Remover esta matrícula?"
                        >
                          Remover
                        </ActionButton>
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
