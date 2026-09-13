import { FileCheck2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { situacaoDoDocumento } from "@/lib/documentos";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DocumentoForm } from "@/components/admin/documento-form";
import { DocumentoAcoes } from "@/components/admin/documento-acoes";
import { formatDateTime } from "@/lib/utils";

/**
 * Documentos com aceite: publicar, revisar e — o que importa — ver QUEM FALTA.
 *
 * A lista de quem já assinou é a parte fácil e a menos útil. A pergunta que o
 * RH e a auditoria fazem é a inversa, e é por ela que a tela é organizada.
 */
export const dynamic = "force-dynamic";

export default async function DocumentosAdminPage() {
  await requireAdmin();

  const [documentos, departamentos] = await Promise.all([
    db.documento.findMany({
      orderBy: [{ publicado: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        arquivoId: true,
        versao: true,
        publicado: true,
        createdAt: true,
        departamentos: { select: { department: { select: { id: true, name: true } } } },
        _count: { select: { aceites: true } },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // A situação de cada documento, para a barra de "quantos faltam".
  const situacoes = new Map(
    await Promise.all(
      documentos.map(
        async (d) => [d.id, await situacaoDoDocumento(d.id)] as const
      )
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Documentos</h1>
        <p className="mt-1 text-sm text-ink-700/70">
          Política, norma e código de conduta que o funcionário precisa ler e aceitar. O curso
          prova que a pessoa foi treinada; o aceite prova que ela foi informada.
        </p>
      </div>

      <DocumentoForm departamentos={departamentos} />

      {documentos.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="Nenhum documento cadastrado"
          description="Envie o PDF de uma política e escolha quem precisa aceitá-la."
        />
      ) : (
        <div className="space-y-4">
          {documentos.map((doc) => {
            const situacao = situacoes.get(doc.id);
            const total = situacao?.resumo.total ?? 0;
            const aceito = situacao?.resumo.aceito ?? 0;
            const percentual = total === 0 ? 0 : Math.round((aceito / total) * 100);
            const faltam = total - aceito;

            return (
              <div key={doc.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-ink-900">{doc.titulo}</h2>
                      <Badge tone={doc.publicado ? "success" : "neutral"}>
                        {doc.publicado ? "Publicado" : "Rascunho"}
                      </Badge>
                      <Badge tone="neutral">Versão {doc.versao}</Badge>
                    </div>

                    {doc.descricao && (
                      <p className="mt-1 text-sm text-ink-700/70">{doc.descricao}</p>
                    )}

                    <p className="mt-2 text-xs text-ink-700/60">
                      {doc.departamentos.length === 0
                        ? "Vale para a rede inteira"
                        : `Setores: ${doc.departamentos.map((d) => d.department.name).join(", ")}`}
                      {" · "}
                      criado em {formatDateTime(doc.createdAt)}
                    </p>
                  </div>

                  <DocumentoAcoes
                    documentoId={doc.id}
                    publicado={doc.publicado}
                    temAceites={doc._count.aceites > 0}
                    arquivoId={doc.arquivoId}
                  />
                </div>

                {doc.publicado && (
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-800">
                        {aceito} de {total} aceitaram
                        {faltam > 0 && (
                          <span className="text-ink-700/70"> · faltam {faltam}</span>
                        )}
                      </span>
                      <span className="text-ink-700/60">{percentual}%</span>
                    </div>
                    <ProgressBar percent={percentual} className="mt-2" />

                    {situacao && faltam > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-brand-texto">
                          Ver quem falta ({faltam})
                        </summary>
                        <ul className="mt-2 space-y-1 text-sm text-ink-700/80">
                          {situacao.linhas
                            .filter((l) => l.situacao !== "aceito")
                            .map((l) => (
                              <li key={l.userId} className="flex items-center gap-2">
                                <span>{l.nome}</span>
                                {l.situacao === "revisado" && (
                                  <Badge tone="warning">aceitou a v{l.versaoAceita}</Badge>
                                )}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
