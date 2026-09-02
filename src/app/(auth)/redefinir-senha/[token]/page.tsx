"use client";

import { useState, useTransition, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/actions/password-reset";

export default function ResetPasswordPage(
  props: {
    params: Promise<{ token: string }>;
  }
) {
  const params = use(props.params);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true; message?: string } | { ok: false; error: string } | null>(
    null
  );
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await resetPassword(params.token, formData);
      setResult(res);
      if (res.ok) {
        setTimeout(() => router.push("/login"), 1800);
      }
    });
  }

  return (
    <AuthShell
      title="Definir nova senha"
      subtitle="Escolha uma nova senha para acessar sua conta."
      footer={
        <p className="text-center text-xs text-ink-700/60">
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Voltar para o login
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {result && !result.ok && <Alert tone="danger">{result.error}</Alert>}
        {result && result.ok && <Alert tone="success">{result.message} Redirecionando...</Alert>}

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink-900">
            Nova senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-ink-900">
            Confirmar nova senha
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={6}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Salvando..." : "Redefinir senha"}
        </Button>
      </form>
    </AuthShell>
  );
}
