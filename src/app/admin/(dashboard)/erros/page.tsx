import { ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { ehProprietario } from "@/lib/alcance-admin";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { lerErrosRecentes } from "@/lib/registro-de-erros";

export const dynamic = "force-dynamic";

/**
 * Erros de produção, legíveis sem SSH.
 *
 * O usuário que vê uma tela quebrada recebe "Código para o suporte: 2268569496".
 * Esta tela é onde esse número vira uma pilha de chamadas. Antes dela, o
 * caminho era pedir acesso por SSH e torcer para a hospedagem ter preservado
 * o stderr — que, quando fomos ver, estava vazio.
 *
 * Só o proprietário: uma pilha de chamadas expõe caminhos internos e trechos
 * de consulta, que não são assunto de administrador de departamento.
 */
export default async function ErrosPage() {
  const admin = await requireAdmin();
  if (!(await ehProprietario(admin.id))) notFound();

  const erros = await lerErrosRecentes(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Erros do servidor</h1>
        <p className="text-sm text-ink-700/70">
          Últimas falhas registradas em produção, da mais recente para a mais
          antiga. Quando alguém informar um código de suporte, procure-o aqui.
        </p>
      </div>

      {erros.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Nenhum erro registrado"
          description="É o estado desejado. Esta tela se enche sozinha quando algo quebra."
        />
      ) : (
        <div className="space-y-3">
          {erros.map((erro, indice) => (
            <details
              key={`${erro.quando}-${indice}`}
              className="overflow-hidden rounded-2xl border border-border bg-white"
            >
              <summary className="cursor-pointer list-none px-5 py-4 hover:bg-surface-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    {erro.contexto}
                  </span>
                  {erro.digest && (
                    <span className="rounded-lg bg-surface-muted px-2 py-0.5 font-mono text-xs text-ink-700">
                      código {erro.digest}
                    </span>
                  )}
                  <span className="text-xs text-ink-700/40">
                    {formatDateTime(new Date(erro.quando))}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-900">{erro.mensagem}</p>
              </summary>

              {erro.stack && (
                <pre className="overflow-x-auto border-t border-border bg-surface-muted px-5 py-4 text-xs leading-relaxed text-ink-700">
                  {erro.stack}
                </pre>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
