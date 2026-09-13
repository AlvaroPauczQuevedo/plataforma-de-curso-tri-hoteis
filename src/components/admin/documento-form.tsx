"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileUploadField } from "@/components/admin/file-upload-field";
import { criarDocumento } from "@/lib/actions/documentos";

const campo =
  "w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

/**
 * Cadastro de documento. Nasce como RASCUNHO de propósito: publicar é um
 * segundo ato, para ninguém colocar uma política na frente da rede inteira com
 * o PDF errado anexado.
 */
export function DocumentoForm({
  departamentos,
}: {
  departamentos: { id: string; name: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<
    { ok: true; message?: string } | { ok: false; error: string } | null
  >(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const dados = new FormData(formulario);

    startTransition(async () => {
      const res = await criarDocumento(dados);
      setResultado(res);
      if (res.ok) {
        formulario.reset();
        setAberto(false);
        router.refresh();
      }
    });
  }

  if (!aberto) {
    return (
      <div className="space-y-3">
        {resultado?.ok && resultado.message && <Alert tone="success">{resultado.message}</Alert>}
        <Button onClick={() => setAberto(true)}>
          <Plus className="h-4 w-4" />
          Novo documento
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      {resultado && !resultado.ok && <Alert tone="danger">{resultado.error}</Alert>}

      <div className="space-y-1.5">
        <label htmlFor="titulo" className="text-sm font-medium text-ink-900">
          Título
        </label>
        <input id="titulo" name="titulo" required minLength={3} className={campo} placeholder="Código de Conduta" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="descricao" className="text-sm font-medium text-ink-900">
          Descrição <span className="font-normal text-ink-700/60">(opcional)</span>
        </label>
        <textarea id="descricao" name="descricao" rows={2} className={campo} />
      </div>

      <FileUploadField kind="pdfs" name="arquivoId" label="PDF do documento" />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-900">Quem precisa aceitar</legend>
        <p className="text-xs text-ink-700/60">
          Nenhum setor marcado = a rede inteira (só o proprietário pode publicar assim).
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          {departamentos.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                name="departamentos"
                value={d.id}
                className="h-4 w-4 rounded border-border accent-brand-600"
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
          {pendente ? "Salvando..." : "Salvar como rascunho"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
