import { History, LogIn, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getHistory } from "@/lib/portal-data";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";

export default async function HistoricoPage() {
  const user = await requireUser();
  const { lessonProgress, accessLogs } = await getHistory(user.id);
  const lastAccess = accessLogs[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Histórico de aprendizagem</h1>
        <p className="text-sm text-navy-700/70">
          {lastAccess
            ? `Seu último acesso foi em ${formatDateTime(lastAccess.createdAt)}.`
            : "Acompanhe aqui suas aulas concluídas."}
        </p>
      </div>

      {lessonProgress.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma atividade registrada"
          description="Assim que você concluir aulas, elas aparecerão aqui em ordem cronológica."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <ul className="divide-y divide-border">
            {lessonProgress.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-900">
                    {p.lesson.title}
                  </p>
                  <p className="truncate text-xs text-navy-700/60">
                    {p.lesson.module.course.title}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-navy-700/50">{formatDateTime(p.completedAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {accessLogs.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-900">
            <LogIn className="h-5 w-5" />
            Últimos acessos
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <ul className="divide-y divide-border">
              {accessLogs.slice(0, 8).map((log) => (
                <li key={log.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-navy-700">Login na plataforma</span>
                  <span className="text-navy-700/50">{formatDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
