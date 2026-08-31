import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notFound } from "next/navigation";
import { ehProprietario } from "@/lib/alcance-admin";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";

export default async function RelatoriosPage() {
  const admin = await requireAdmin();

  /*
    Tela da conta proprietária. Relatórios e Atividades mostram a plataforma
    inteira — progresso e histórico de ação de todos os departamentos —, e
    Configurações decide a estrutura que governa o alcance de todo mundo.

    Devolve página inexistente em vez de uma tela de recusa: para quem não a
    alcança, a rota simplesmente não existe.
  */
  if (!(await ehProprietario(admin.id))) notFound();

  const now = new Date();

  /*
    Esta tela é uma consolidação: ela resume a plataforma inteira, então não há
    o que paginar. O que dava para corrigir era COMO os números são obtidos —
    antes, cada abertura trazia todas as matrículas e todos os registros de
    progresso para somar em memória. Agora a soma acontece no banco, e só duas
    listas pequenas vêm inteiras: os pares já concluídos e os com prazo
    vencido, necessários para cruzar as duas tabelas.
  */
  const [courses, matriculasPorCurso, progressoPorCurso, emAndamentoPorCurso, concluidos, comPrazoVencido] =
    await Promise.all([
      db.course.findMany({ orderBy: { title: "asc" } }),
      db.enrollment.groupBy({ by: ["courseId"], _count: { _all: true } }),
      db.courseProgress.groupBy({
        by: ["courseId"],
        _avg: { percent: true },
        _count: { _all: true },
      }),
      db.courseProgress.groupBy({
        by: ["courseId"],
        where: { percent: { gt: 0, lt: 100 } },
        _count: { _all: true },
      }),
      db.courseProgress.findMany({
        where: { percent: { gte: 100 } },
        select: { userId: true, courseId: true },
      }),
      db.enrollment.findMany({
        where: { dueDate: { lt: now } },
        select: { userId: true, courseId: true },
      }),
    ]);

  const chaveDe = (p: { userId: string; courseId: string }) => `${p.userId}:${p.courseId}`;
  const jaConcluiu = new Set(concluidos.map(chaveDe));

  const matriculas = new Map(matriculasPorCurso.map((m) => [m.courseId, m._count._all]));
  const progresso = new Map(progressoPorCurso.map((p) => [p.courseId, p]));
  const emAndamento = new Map(emAndamentoPorCurso.map((p) => [p.courseId, p._count._all]));

  const concluidosPorCurso = new Map<string, number>();
  for (const c of concluidos) {
    concluidosPorCurso.set(c.courseId, (concluidosPorCurso.get(c.courseId) ?? 0) + 1);
  }

  // Atrasado é prazo vencido sem conclusão — o cruzamento que o banco não faz.
  const atrasadosPorCurso = new Map<string, number>();
  for (const e of comPrazoVencido) {
    if (jaConcluiu.has(chaveDe(e))) continue;
    atrasadosPorCurso.set(e.courseId, (atrasadosPorCurso.get(e.courseId) ?? 0) + 1);
  }

  const courseReport = courses.map((course) => ({
    course,
    total: matriculas.get(course.id) ?? 0,
    completed: concluidosPorCurso.get(course.id) ?? 0,
    inProgress: emAndamento.get(course.id) ?? 0,
    overdue: atrasadosPorCurso.get(course.id) ?? 0,
    avgPercent: Math.round(progresso.get(course.id)?._avg.percent ?? 0),
  }));

  /*
    Antes, esta consulta trazia cada funcionário com TODO o progresso dele
    aninhado, só para tirar uma média. Agora vêm duas listas rasas — o
    departamento de cada funcionário e o percentual de cada progresso — e a
    média é montada com uma passada em cada.
  */
  const [departments, funcionarios, todoProgresso] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { role: "EMPLOYEE" },
      select: { id: true, departmentId: true },
    }),
    db.courseProgress.findMany({ select: { userId: true, percent: true } }),
  ]);

  const departamentoDoUsuario = new Map(funcionarios.map((u) => [u.id, u.departmentId]));

  const somaPorDepartamento = new Map<string, { soma: number; itens: number }>();
  for (const p of todoProgresso) {
    const dep = departamentoDoUsuario.get(p.userId);
    if (!dep) continue; // administrador ou funcionário sem departamento
    const atual = somaPorDepartamento.get(dep) ?? { soma: 0, itens: 0 };
    atual.soma += p.percent;
    atual.itens += 1;
    somaPorDepartamento.set(dep, atual);
  }

  const funcionariosPorDepartamento = new Map<string, number>();
  for (const u of funcionarios) {
    if (!u.departmentId) continue;
    funcionariosPorDepartamento.set(
      u.departmentId,
      (funcionariosPorDepartamento.get(u.departmentId) ?? 0) + 1
    );
  }

  const departmentReport = departments.map((dept) => {
    const acumulado = somaPorDepartamento.get(dept.id);
    return {
      department: dept,
      totalEmployees: funcionariosPorDepartamento.get(dept.id) ?? 0,
      avgPercent: acumulado ? Math.round(acumulado.soma / acumulado.itens) : 0,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Relatórios de progresso</h1>
        <p className="text-sm text-ink-700/70">Visão consolidada de conclusão por curso e por departamento.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink-900">Por curso</h2>
        {courseReport.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum curso cadastrado" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
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
                      <td className="px-4 py-3 font-medium text-ink-900">{r.course.title}</td>
                      <td className="px-4 py-3 text-ink-700">{r.total}</td>
                      <td className="px-4 py-3 text-ink-700">{r.inProgress}</td>
                      <td className="px-4 py-3 text-ink-700">{r.completed}</td>
                      <td className="px-4 py-3">
                        {r.overdue > 0 ? <Badge tone="danger">{r.overdue}</Badge> : <span className="text-ink-700/50">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={r.avgPercent} size="sm" className="w-28" />
                          <span className="text-xs text-ink-700/60">{r.avgPercent}%</span>
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
        <h2 className="font-semibold text-ink-900">Por departamento</h2>
        {departmentReport.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum departamento cadastrado" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Departamento</th>
                    <th className="px-4 py-3 font-medium">Funcionários</th>
                    <th className="px-4 py-3 font-medium">Conclusão média</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {departmentReport.map((r) => (
                    <tr key={r.department.id} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3 font-medium text-ink-900">{r.department.name}</td>
                      <td className="px-4 py-3 text-ink-700">{r.totalEmployees}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={r.avgPercent} size="sm" className="w-28" />
                          <span className="text-xs text-ink-700/60">{r.avgPercent}%</span>
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
