import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { ConfirmarEmailBotao } from "@/components/auth/confirmar-email-botao";
import { db } from "@/lib/db";

/**
 * Recebe o link de confirmação do e-mail pessoal.
 *
 * A gravação acontece num CLIQUE, e não ao abrir a página, por dois motivos.
 * O primeiro é técnico: um efeito colateral no render pode rodar duas vezes, e
 * a segunda execução diria "este link não vale mais" para quem acabou de
 * acertar. O segundo é que assim a pessoa vê QUAL endereço está confirmando
 * antes de confirmar — se ela digitou errado e a mensagem chegou na caixa de
 * outra pessoa, é esta tela que dá a ela a chance de simplesmente fechar.
 */
export default async function ConfirmarEmailPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  const pedido = await db.emailConfirmacao.findUnique({
    where: { token },
    include: { user: { select: { name: true } } },
  });

  const valido = pedido && !pedido.usedAt && pedido.expiresAt > new Date();

  return (
    <AuthShell
      title="Confirmar e-mail"
      subtitle={
        valido
          ? "Confira o endereço abaixo e confirme."
          : "Não foi possível usar este link."
      }
      footer={
        <p className="text-center text-xs text-ink-700/60">
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Ir para o login
          </Link>
        </p>
      }
    >
      {valido ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted px-3.5 py-3">
            <p className="text-xs text-ink-700/60">Endereço</p>
            <p className="text-sm font-medium text-ink-900">{pedido.email}</p>
            <p className="mt-2 text-xs text-ink-700/60">Conta</p>
            <p className="text-sm text-ink-900">{pedido.user.name}</p>
          </div>

          <p className="text-xs text-ink-700/70">
            Depois de confirmar, este endereço passa a receber o link de nova senha
            quando você esquecer a sua. Se não foi você quem pediu, feche esta página:
            sem o clique, nada é gravado.
          </p>

          <ConfirmarEmailBotao token={token} />
        </div>
      ) : (
        <Alert tone="danger">
          Este link já foi usado ou passou das 24 horas. Entre na plataforma, abra
          Perfil e peça outro em &quot;Meu e-mail&quot;.
        </Alert>
      )}
    </AuthShell>
  );
}
