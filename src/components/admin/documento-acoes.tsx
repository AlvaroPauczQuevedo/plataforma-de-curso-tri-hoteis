"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { FileUploadField } from "@/components/admin/file-upload-field";
import {
  excluirDocumento,
  novaVersaoDeDocumento,
  publicarDocumento,
} from "@/lib/actions/documentos";

/**
 * Publicar, revisar e excluir.
 *
 * "Revisar" abre o envio de um PDF novo e sobe a versão — o que devolve todo
 * mundo para a fila de aceite. Por isso a confirmação diz isso com todas as
 * letras: é a ação com maior efeito colateral desta tela.
 */
export function DocumentoAcoes({
  documentoId,
  publicado,
  temAceites,
  arquivoId,
}: {
  documentoId: string;
  publicado: boolean;
  temAceites: boolean;
  arquivoId: string;
}) {
  const [revisando, setRevisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function enviarRevisao(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const novoArquivo = String(dados.get("arquivoId") ?? "");
    if (!novoArquivo) {
      setErro("Anexe o PDF da nova versão.");
      return;
    }

    setErro(null);
    startTransition(async () => {
      const res = await novaVersaoDeDocumento(documentoId, novoArquivo);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setRevisando(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/files/${arquivoId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-ink-800 transition hover:bg-surface-muted"
        >
          <FileText className="h-4 w-4" />
          Ver PDF
        </a>

        <ActionButton
          action={() => publicarDocumento(documentoId, !publicado)}
          confirmMessage={
            publicado
              ? "Voltar para rascunho? Ele sai da tela dos funcionários; os aceites já registrados são preservados."
              : undefined
          }
        >
          {publicado ? "Voltar para rascunho" : "Publicar"}
        </ActionButton>

        <Button variant="outline" size="sm" onClick={() => setRevisando((v) => !v)}>
          Nova versão
        </Button>

        {!temAceites && (
          <ActionButton
            action={() => excluirDocumento(documentoId)}
            variant="danger"
            confirmMessage="Excluir este documento? Ele ainda não tem nenhum aceite registrado."
          >
            Excluir
          </ActionButton>
        )}
      </div>

      {revisando && (
        <form
          onSubmit={enviarRevisao}
          className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4"
        >
          {erro && <Alert tone="danger">{erro}</Alert>}
          <p className="text-sm text-ink-800">
            Enviar uma versão nova devolve <strong>todos</strong> à fila de aceite. Os aceites da
            versão atual continuam registrados como prova de quem leu o texto anterior.
          </p>
          <FileUploadField kind="pdfs" name="arquivoId" label="PDF da nova versão" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
              {pendente ? "Publicando..." : "Publicar nova versão"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setRevisando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
