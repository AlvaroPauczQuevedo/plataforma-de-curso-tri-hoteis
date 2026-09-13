"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registrarAceite } from "@/lib/actions/documentos";

/**
 * O "li e concordo".
 *
 * A caixa de marcar vem antes do botão, e o botão só liga quando ela está
 * marcada. É um atrito deliberado: o aceite é um registro que a empresa vai
 * apresentar numa auditoria, e um clique único e distraído enfraquece
 * exatamente o que ele deveria provar.
 */
export function AceiteDeDocumento({
  documentoId,
  titulo,
}: {
  documentoId: string;
  titulo: string;
}) {
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function aceitar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await registrarAceite(documentoId);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => setMarcado(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-brand-600"
        />
        <span>
          Li o documento <span className="font-medium">{titulo}</span> e estou de acordo.
        </span>
      </label>

      <div className="flex items-center gap-3">
        {erro && <span className="text-sm text-danger-600">{erro}</span>}
        <Button onClick={aceitar} disabled={!marcado || pendente} size="sm">
          {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
          {pendente ? "Registrando..." : "Registrar aceite"}
        </Button>
      </div>
    </div>
  );
}
