import { History } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notFound } from "next/navigation";
import { ehProprietario } from "@/lib/alcance-admin";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { rotuloDaAtividade } from "@/lib/rotulos-atividade";

export default async function AtividadesPage() {
  const admin = await requireAdmin();

  /*
    Tela da conta proprietária. Relatórios e Atividades mostram a plataforma
    inteira — progresso e histórico de ação de todos os departamentos —, e
    Configurações decide a estrutura que governa o alcance de todo mundo.

    Devolve página inexistente em vez de uma tela de recusa: para quem não a
    alcança, a rota simplesmente não existe.
  */
  if (!(await ehProprietario(admin.id))) notFound();

  const logs = await db.adminActivityLog.findMany({
    include: { admin: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Histórico de atividades</h1>
        <p className="text-sm text-ink-700/70">Registro das principais ações administrativas na plataforma.</p>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={History} title="Nenhuma atividade registrada ainda" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="px-5 py-4">
                <p className="text-sm">
                  <span className="font-medium text-ink-900">{log.admin.name}</span>{" "}
                  <span className="text-ink-700/70">{rotuloDaAtividade(log.action)}</span>{" "}
                  {log.details && <span className="text-ink-700">{log.details}</span>}
                </p>
                <p className="text-xs text-ink-700/40">{formatDateTime(log.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
