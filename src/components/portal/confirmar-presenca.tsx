"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { registrarPresenca } from "@/lib/actions/presenca";

/**
 * O botão que marca presença.
 *
 * Um toque, sem confirmação intermediária. Ao contrário do aceite de
 * documento — que pede a caixa marcada porque é uma declaração de leitura —,
 * aqui a pessoa já está na sala, com o instrutor na frente e a turma
 * esperando: qualquer passo a mais é fila.
 *
 * O código é validado no servidor, no instante do clique. Se venceu entre
 * abrir a página e tocar o botão, a mensagem manda apontar a câmera de novo —
 * e o botão continua ali, porque a segunda tentativa é a normal.
 */
export function ConfirmarPresenca({ sessaoId, codigo }: { sessaoId: string; codigo: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const res = await registrarPresenca(sessaoId, codigo);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setPronto(true);
      router.refresh();
    });
  }

  if (pronto) {
    return (
      <Alert tone="success">
        <span className="font-medium">Presença confirmada.</span> Ela entra na sua ficha quando o
        instrutor fechar a lista.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {erro && <Alert tone="danger">{erro}</Alert>}

      <Button type="button" onClick={confirmar} disabled={pendente} className="w-full" size="lg">
        {pendente ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
        Confirmar minha presença
      </Button>
    </div>
  );
}
