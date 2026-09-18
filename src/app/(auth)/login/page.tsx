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
        <div className="space-y-2 text-center text-xs text-ink-700/60">
          <p>
            É administrador?{" "}
            <Link href="/admin/login" className="font-medium text-brand-texto hover:underline">
              Acesse o painel administrativo
            </Link>
          </p>
          {/*
            O aviso de privacidade fica AQUI, antes do login, porque é aqui que
            a pessoa ainda pode lê-lo sem ter entrado — que é o que o Art. 9º
            da LGPD pretende.
          */}
          <p>
            <Link href="/privacidade" className="hover:underline">
              Aviso de privacidade
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm variant="employee" callbackUrl={searchParams.callbackUrl} />
    </AuthShell>
  );
}
