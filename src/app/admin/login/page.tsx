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
    >
      <LoginForm variant="admin" callbackUrl={searchParams.callbackUrl} />
    </AuthShell>
  );
}
