"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { confirmarEmail } from "@/lib/actions/email-pessoal";

type Resultado = { ok: true; message?: string } | { ok: false; error: string };

export function ConfirmarEmailBotao({ token }: { token: string }) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const router = useRouter();

  function confirmar() {
    iniciar(async () => {
      const r = await confirmarEmail(token);
      setResultado(r);
      if (r.ok) setTimeout(() => router.push("/login"), 2200);
    });
  }

  if (resultado?.ok) {
    return <Alert tone="success">{resultado.message}</Alert>;
  }

  return (
    <div className="space-y-3">
      {resultado && !resultado.ok && <Alert tone="danger">{resultado.error}</Alert>}
      <Button onClick={confirmar} disabled={pendente} className="w-full" type="button">
        {pendente ? "Confirmando..." : "Confirmar este e-mail"}
      </Button>
    </div>
  );
}
