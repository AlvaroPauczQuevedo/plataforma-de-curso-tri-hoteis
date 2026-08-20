import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle="Entre com seu e-mail e senha para acessar seus cursos."
      footer={
        <p className="text-center text-xs text-navy-700/60">
          É administrador?{" "}
          <Link href="/admin/login" className="font-medium text-accent-600 hover:underline">
            Acesse o painel administrativo
          </Link>
        </p>
      }
    >
      <LoginForm variant="employee" callbackUrl={searchParams.callbackUrl} />
    </AuthShell>
  );
}
