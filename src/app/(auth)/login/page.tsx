import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage(
  props: {
    searchParams: Promise<{ callbackUrl?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle="Entre com seu nome de usuário e senha para acessar seus cursos."
      footer={
        <p className="text-center text-xs text-ink-700/60">
          É administrador?{" "}
          <Link href="/admin/login" className="font-medium text-brand-700 hover:underline">
            Acesse o painel administrativo
          </Link>
        </p>
      }
    >
      <LoginForm variant="employee" callbackUrl={searchParams.callbackUrl} />
    </AuthShell>
  );
}
