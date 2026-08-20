"use client";

import { useState } from "react";
import Link from "next/link";
import { useTransition } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/actions/password-reset";

export default function ForgotPasswordPage() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true; message?: string; resetLink?: string } | { ok: false; error: string } | null
  >(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await requestPasswordReset(formData);
      setResult(res);
    });
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Informe seu e-mail corporativo para receber o link de redefinição."
      footer={
        <p className="text-center text-xs text-navy-700/60">
          <Link href="/login" className="font-medium text-accent-600 hover:underline">
            Voltar para o login
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {result && !result.ok && <Alert tone="danger">{result.error}</Alert>}
        {result && result.ok && (
          <Alert tone="success">
            <p>{result.message}</p>
            {result.resetLink && (
              <p className="mt-2 text-xs">
                Ambiente de demonstração — sem envio de e-mail real. Link gerado:{" "}
                <Link href={result.resetLink} className="font-medium underline">
                  {result.resetLink}
                </Link>
              </p>
            )}
          </Alert>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-navy-900">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="seunome@trihoteis.com.br"
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Enviando..." : "Enviar link de redefinição"}
        </Button>
      </form>
    </AuthShell>
  );
}
