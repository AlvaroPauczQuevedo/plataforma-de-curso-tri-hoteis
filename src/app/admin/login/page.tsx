import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  return (
    <AuthShell
      badge="Painel Administrativo"
      title="Acesso administrativo"
      subtitle="Entre com suas credenciais de administrador."
      footer={
        <p className="text-center text-xs text-ink-700/60">
          Não é administrador?{" "}
          <Link
            href="/login"
            className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para o acesso do funcionário
          </Link>
        </p>
      }
    >
      <LoginForm variant="admin" callbackUrl={searchParams.callbackUrl} />
    </AuthShell>
  );
}
