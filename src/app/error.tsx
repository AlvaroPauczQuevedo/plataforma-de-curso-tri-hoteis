"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Tela de erro do aplicativo.
 *
 * Faz duas coisas que a tela padrão do Next não faz: avisa o servidor de que
 * algo quebrou — para o alerta sair na hora, e não quando alguém reclamar — e
 * mostra ao usuário uma saída, em vez de só um código.
 *
 * O `digest` aparece de propósito: é o que liga o que o usuário viu à linha
 * correspondente no log do servidor.
 */
export default function ErroDaAplicacao({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Não bloqueia a renderização e não faz diferença se falhar: o servidor já
    // gravou o erro; este aviso só antecipa a notificação.
    fetch("/api/erros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest: error.digest, url: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold text-ink-900">Algo deu errado nesta tela</h1>
        <p className="text-sm text-ink-700/70">
          O problema foi registrado e a equipe responsável já foi avisada. Você pode
          tentar de novo ou voltar ao início.
        </p>

        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            Tentar de novo
          </button>
          <Link
            href="/"
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-surface-muted"
          >
            Ir para o início
          </Link>
        </div>

        {error.digest && (
          <p className="pt-2 text-xs text-ink-700/50">
            Código para o suporte: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
