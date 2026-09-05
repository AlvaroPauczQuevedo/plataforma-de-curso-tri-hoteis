import { MessageCircle } from "lucide-react";
import { linkDeWhatsApp } from "@/lib/whatsapp";

/**
 * Abre o WhatsApp com a mensagem já escrita.
 *
 * É um link, e não um botão que dispara envio: quem manda é a pessoa, do
 * próprio número dela, depois de ler o que vai sair. Envio automático exigiria
 * a API oficial paga — ou uma biblioteca não oficial, que derruba o número da
 * empresa. Para algumas dezenas de funcionários, o clique resolve.
 *
 * `target="_blank"` porque o `wa.me` sai da plataforma: sem isso, quem
 * administra perderia a lista que estava usando para cobrar.
 */
export function BotaoWhatsApp({
  telefone,
  mensagem,
  rotulo = "WhatsApp",
  titulo,
}: {
  telefone: string | null | undefined;
  mensagem: string;
  rotulo?: string;
  /** Texto do `title`, para quem passa o mouse antes de clicar. */
  titulo?: string;
}) {
  if (!telefone) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-ink-700/40"
        title="Cadastre o WhatsApp desta pessoa para poder avisá-la."
      >
        <MessageCircle className="h-3.5 w-3.5" />
        sem WhatsApp
      </span>
    );
  }

  return (
    <a
      href={linkDeWhatsApp(telefone, mensagem)}
      target="_blank"
      rel="noopener noreferrer"
      title={titulo ?? "Abre o WhatsApp com a mensagem pronta. Você confere antes de enviar."}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/25 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {rotulo}
    </a>
  );
}
