"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LoginForm({
  variant,
  callbackUrl,
}: {
  variant: "employee" | "admin";
  callbackUrl?: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Nome de usuário ou senha inválidos.");
      setLoading(false);
      return;
    }

    const session = await getSession();

    if (variant === "admin" && session?.user.role !== "ADMIN") {
      setError("Esta conta não possui acesso ao painel administrativo.");
      setLoading(false);
      return;
    }

    router.push(callbackUrl || (variant === "admin" ? "/admin" : "/"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium text-ink-900">
          Nome de usuário
        </label>
        <input
          id="username"
          type="text"
          required
          autoComplete="username"
          /*
            O celular é onde a maior parte da rede entra, e por padrão ele
            capitaliza a primeira letra e tenta corrigir a palavra. As duas
            coisas estragam um identificador que é sempre minúsculo — e o erro
            resultante ("usuário ou senha inválidos") não diz que foi o teclado.
          */
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="maria.silva"
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-ink-900">
            Senha
          </label>
          {variant === "employee" && (
            <a href="/esqueci-senha" className="text-xs font-medium text-brand-700 hover:underline">
              Esqueci minha senha
            </a>
          )}
        </div>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
