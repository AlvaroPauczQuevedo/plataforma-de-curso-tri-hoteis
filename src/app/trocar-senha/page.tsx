"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trocarSenhaProvisoria } from "@/lib/actions/intranet";

const campoClasse =
  "w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

/**
 * Troca da senha provisória, exigida no primeiro acesso.
 *
 * Fica fora do grupo (portal) de propósito: o layout do portal redireciona
 * para cá enquanto a troca estiver pendente, e uma página dentro dele criaria
 * um laço de redirecionamento.
 */
export default function TrocarSenhaPage() {
  const [pendente, iniciarTransicao] = useTransition();
  const [resultado, setResultado] = useState<
    | { ok: true; message?: string; redirectTo?: string }
    | { ok: false; error: string }
    | null
  >(null);
  const router = useRouter();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciarTransicao(async () => {
      const resposta = await trocarSenhaProvisoria(dados);
      setResultado(resposta);
      if (resposta.ok) {
        const destino = "redirectTo" in resposta ? resposta.redirectTo : "/";
        setTimeout(() => router.push(destino ?? "/"), 1200);
      }
    });
  }

  return (
    <AuthShell
      badge="Primeiro acesso"
      title="Defina sua senha"
      subtitle="Sua conta foi criada com uma senha provisória. Escolha uma senha pessoal para continuar."
    >
      <form onSubmit={enviar} className="space-y-4">
        {resultado && !resultado.ok && <Alert tone="danger">{resultado.error}</Alert>}
        {resultado && resultado.ok && (
          <Alert tone="success">{resultado.message} Entrando...</Alert>
        )}

        <div className="space-y-1.5">
          <label htmlFor="senhaAtual" className="text-sm font-medium text-ink-900">
            Senha provisória
          </label>
          <input
            id="senhaAtual"
            name="senhaAtual"
            type="password"
            required
            autoComplete="current-password"
            className={campoClasse}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="novaSenha" className="text-sm font-medium text-ink-900">
            Nova senha
          </label>
          <input
            id="novaSenha"
            name="novaSenha"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={campoClasse}
          />
          <p className="text-xs text-ink-700/60">Mínimo de 6 caracteres.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmacao" className="text-sm font-medium text-ink-900">
            Confirmar nova senha
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={campoClasse}
          />
        </div>

        <Button type="submit" disabled={pendente} className="w-full">
          {pendente ? "Salvando..." : "Salvar e entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
