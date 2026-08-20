import { History } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { EmptyState } from "@/components/ui/empty-state";
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

export default async function AtividadesPage() {
  await requireAdmin();

  const logs = await db.adminActivityLog.findMany({
    include: { admin: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Histórico de atividades</h1>
        <p className="text-sm text-navy-700/70">Registro das principais ações administrativas na plataforma.</p>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={History} title="Nenhuma atividade registrada ainda" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="px-5 py-4">
                <p className="text-sm">
                  <span className="font-medium text-navy-900">{log.admin.name}</span>{" "}
                  <span className="text-navy-700/70">{actionLabels[log.action] ?? log.action.toLowerCase()}</span>{" "}
                  {log.details && <span className="text-navy-700">{log.details}</span>}
                </p>
                <p className="text-xs text-navy-700/40">{formatDateTime(log.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
