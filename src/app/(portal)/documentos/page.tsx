import { FileText, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { documentosDaPessoa } from "@/lib/documentos";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AceiteDeDocumento } from "@/components/portal/aceite-de-documento";
import { formatDateTime } from "@/lib/utils";

/**
 * Os documentos que esta pessoa precisa ler e aceitar.
 *
 * Pendente primeiro, e o "revisado" com texto próprio: quem já assinou uma vez
 * merece saber que o documento MUDOU, e não receber a mesma cobrança de quem
 * nunca leu nada.
 */
export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const user = await requireUser();
  const documentos = await documentosDaPessoa(user.id);

  const PESO = { pendente: 0, revisado: 1, aceito: 2 } as const;
  const ordenados = [...documentos].sort((a, b) => PESO[a.situacao] - PESO[b.situacao]);
  const pendentes = ordenados.filter((d) => d.situacao !== "aceito").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Documentos</h1>
        <p className="mt-1 text-sm text-ink-700/70">
          {pendentes > 0
            ? `Você tem ${pendentes} documento(s) aguardando sua leitura e aceite.`
            : "Você está em dia com os documentos da rede."}
        </p>
      </div>

      {ordenados.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento por aqui"
          description="Quando o setor de treinamento publicar uma política ou norma para você, ela aparece nesta tela."
        />
      ) : (
        <div className="space-y-4">
          {ordenados.map((doc) => (
            <div key={doc.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-ink-900">{doc.titulo}</h2>
                    {doc.situacao === "aceito" && <Badge tone="success">Aceito</Badge>}
                    {doc.situacao === "pendente" && <Badge tone="warning">Pendente</Badge>}
                    {doc.situacao === "revisado" && <Badge tone="warning">Revisado — leia de novo</Badge>}
                  </div>

                  {doc.descricao && (
                    <p className="mt-1 text-sm text-ink-700/70">{doc.descricao}</p>
                  )}

                  <p className="mt-2 text-xs text-ink-700/60">
                    Versão {doc.versao}
                    {doc.situacao === "revisado" && doc.versaoAceita !== null && (
                      <> · você aceitou a versão {doc.versaoAceita}</>
                    )}
                    {doc.situacao === "aceito" && doc.aceitoEm && (
                      <> · aceito em {formatDateTime(doc.aceitoEm)}</>
                    )}
                  </p>
                </div>

                <a
                  href={`/api/files/${doc.arquivoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-ink-800 transition hover:bg-surface-muted"
                >
                  <FileText className="h-4 w-4" />
                  Ler o documento
                </a>
              </div>

              {doc.situacao !== "aceito" && (
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-brand-texto" />
                  <AceiteDeDocumento documentoId={doc.id} titulo={doc.titulo} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
