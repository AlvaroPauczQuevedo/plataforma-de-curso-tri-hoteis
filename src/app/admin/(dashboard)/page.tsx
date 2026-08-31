import { Users, UserCheck, BookOpenCheck, ClipboardList, AlarmClock, TrendingUp } from "lucide-react";
import { getDashboardStats } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/session";
import { ehProprietario } from "@/lib/alcance-admin";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPieChart, DepartmentBarChart } from "@/components/admin/charts";
import { formatDateTime } from "@/lib/utils";

const actionLabels: Record<string, string> = {
  CRIAR_CURSO: "criou o curso",
  EDITAR_CURSO: "editou o curso",
  DUPLICAR_CURSO: "duplicou o curso",
  EXCLUIR_CURSO: "excluiu o curso",
  CURSO_PUBLISHED: "publicou o curso",
  CURSO_DRAFT: "moveu para rascunho o curso",
  CURSO_ARCHIVED: "arquivou o curso",
  CRIAR_FUNCIONARIO: "cadastrou o funcionário",
  EDITAR_FUNCIONARIO: "editou o funcionário",
  ATIVAR_FUNCIONARIO: "ativou o acesso de",
  DESATIVAR_FUNCIONARIO: "desativou o acesso de",
  REDEFINIR_SENHA: "redefiniu a senha de",
  MATRICULAR: "realizou matrícula(s):",
  REMOVER_MATRICULA: "removeu matrícula de",
  CRIAR_DEPARTAMENTO: "criou o departamento",
  CRIAR_CATEGORIA: "criou a categoria",
  CRIAR_MODULO: "criou um módulo em",
};

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  /*
    O painel é o mesmo para todos, com quatro blocos a menos para quem
    administra um departamento: contagem de funcionários, distribuição por
    departamento e atividades recentes falam da plataforma inteira, e a
    plataforma inteira não é o alcance dessa pessoa.

    O que sobra é sobre treinamento — matrículas, conclusões, atrasos e cursos
    mais acessados —, que é o trabalho dela.
  */
  const [proprietario, stats] = await Promise.all([
    ehProprietario(admin.id),
    getDashboardStats(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-700/70">Visão geral da Academia Corporativa Tri Hotéis.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {proprietario && (
          <>
            <StatCard label="Funcionários cadastrados" value={stats.totalEmployees} icon={Users} tone="navy" />
            <StatCard label="Funcionários ativos" value={stats.activeEmployees} icon={UserCheck} tone="accent" />
          </>
        )}
        <StatCard label="Cursos publicados" value={stats.publishedCourses} icon={BookOpenCheck} tone="accent" />
        <StatCard label="Total de matrículas" value={stats.totalEnrollments} icon={ClipboardList} tone="navy" />
        <StatCard label="Em andamento" value={stats.inProgress} icon={TrendingUp} tone="accent" />
        <StatCard label="Concluídos" value={stats.completed} icon={BookOpenCheck} tone="success" />
        <StatCard
          label="Treinamentos atrasados"
          value={stats.overdueCount}
          icon={AlarmClock}
          tone={stats.overdueCount > 0 ? "danger" : "success"}
        />
        <StatCard label="Taxa média de conclusão" value={`${stats.avgCompletion}%`} icon={TrendingUp} tone="accent" />
      </div>

      <div className={proprietario ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
        <div className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-3 font-semibold text-ink-900">Status das matrículas</h2>
          <StatusPieChart data={stats.statusBreakdown} />
        </div>
        {proprietario && (
          <div className="rounded-2xl border border-border bg-white p-5">
            <h2 className="mb-3 font-semibold text-ink-900">Funcionários por departamento</h2>
            <DepartmentBarChart data={stats.departmentCounts} />
          </div>
        )}
      </div>

      <div className={proprietario ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
        <div className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-3 font-semibold text-ink-900">Cursos mais acessados</h2>
          {stats.mostAccessed.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-700/50">Nenhuma matrícula registrada ainda.</p>
          ) : (
            <ul className="space-y-3">
              {stats.mostAccessed.map((item, idx) => (
                <li key={item.course.id} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700/10 text-xs font-semibold text-brand-700">
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate text-sm text-ink-900">{item.course.title}</span>
                  <span className="text-xs font-medium text-ink-700/60">{item.count} matrícula(s)</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {proprietario && (
          <div className="rounded-2xl border border-border bg-white p-5">
            <h2 className="mb-3 font-semibold text-ink-900">Atividades recentes</h2>
            {stats.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-700/50">Nenhuma atividade registrada ainda.</p>
            ) : (
              <ul className="space-y-3">
                {stats.recentActivity.map((log) => (
                  <li key={log.id} className="text-sm">
                    <span className="font-medium text-ink-900">{log.admin.name}</span>{" "}
                    <span className="text-ink-700/70">{actionLabels[log.action] ?? log.action.toLowerCase()}</span>{" "}
                    {log.details && <span className="text-ink-700/70">{log.details}</span>}
                    <p className="text-xs text-ink-700/40">{formatDateTime(log.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
