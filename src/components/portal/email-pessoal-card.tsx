"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/shared/action-form";
import { removerEmail, solicitarConfirmacaoDeEmail } from "@/lib/actions/email-pessoal";

/**
 * Cadastro do e-mail pessoal — o único caminho para a pessoa recuperar a
 * própria senha sem passar pelo RH.
 *
 * O texto explica o que o endereço faz, e não só pede o endereço. Quem trabalha
 * na operação de um hotel tem boas razões para desconfiar de um sistema da
 * empresa pedindo o e-mail particular; dizer para que serve — e que é opcional,
 * e que dá para remover depois — é o que separa um cadastro voluntário de um
 * campo que as pessoas preenchem com qualquer coisa para se livrar dele.
 */
export function EmailPessoalCard({
  email,
  envioDisponivel,
}: {
  email: string | null;
  /** Sem SMTP não há como confirmar endereço nenhum, e a tela precisa dizer. */
  envioDisponivel: boolean;
}) {
  const [removendo, startRemocao] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();

  function remover() {
    startRemocao(async () => {
      const r = await removerEmail();
      setAviso(r.ok ? (r.message ?? null) : r.error);
      router.refresh();
    });
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-white p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div>
          <h2 className="text-base font-semibold text-ink-900">Meu e-mail</h2>
          <p className="text-sm text-ink-700/70">
            Opcional. Serve para uma coisa só: se você esquecer a senha, o link para
            criar outra vai para esta caixa — e você resolve sozinho, sem procurar o RH.
          </p>
        </div>
      </div>

      {email ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span className="text-sm text-ink-900">{email}</span>
            <span className="ml-auto text-xs font-medium text-emerald-700">confirmado</span>
          </div>

          {aviso && <Alert tone="success">{aviso}</Alert>}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={remover} disabled={removendo} type="button">
              {removendo ? "Removendo..." : "Remover este e-mail"}
            </Button>
            <p className="text-xs text-ink-700/60">
              Perdeu o acesso a esta caixa? Remova e cadastre outra.
            </p>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-brand-700 hover:underline">
              Trocar por outro endereço
            </summary>
            <div className="pt-3">
              <Formulario disponivel={envioDisponivel} />
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-700/80">
            Você ainda não cadastrou um e-mail. Enquanto não cadastrar, só o RH pode
            redefinir a sua senha.
          </p>
          {aviso && <Alert tone="success">{aviso}</Alert>}
          <Formulario disponivel={envioDisponivel} />
        </div>
      )}
    </section>
  );
}

function Formulario({ disponivel }: { disponivel: boolean }) {
  if (!disponivel) {
    return (
      <Alert tone="warning">
        O envio de e-mail não está ligado nesta instalação, então não há como confirmar
        um endereço. Procure o RH quando precisar de uma senha nova.
      </Alert>
    );
  }

  return (
    <ActionForm action={solicitarConfirmacaoDeEmail} submitLabel="Enviar link de confirmação">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink-900">
          Seu e-mail pessoal
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="seunome@gmail.com"
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
        <p className="text-xs text-ink-700/60">
          Vamos mandar um link para conferir se a caixa é sua mesmo. O endereço só
          entra no cadastro depois que você clicar nele.
        </p>
      </div>
    </ActionForm>
  );
}
