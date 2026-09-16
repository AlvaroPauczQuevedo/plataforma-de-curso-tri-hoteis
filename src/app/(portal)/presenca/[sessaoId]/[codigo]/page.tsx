import { notFound } from "next/navigation";
import { CalendarCheck, MapPin, UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { situacaoDaSessao } from "@/lib/presenca";
import { Alert } from "@/components/ui/alert";
import { ConfirmarPresenca } from "@/components/portal/confirmar-presenca";
import { formatDateTime } from "@/lib/utils";

/**
 * A tela que o QR abre, no celular de quem está na sala.
 *
 * O código vem na URL e é conferido na ACTION, não aqui. A página só mostra o
 * treinamento e o botão: se a validação acontecesse na abertura, o código
 * poderia vencer entre a página carregar e o dedo tocar o botão, e a pessoa
 * veria um erro sem ter feito nada errado. Conferir no clique é conferir no
 * instante que importa.
 *
 * `requireUser` primeiro: quem não está logado é mandado ao login e volta para
 * cá. Sem isso a lista de presença não teria dono — o código diz "estou vendo
 * a tela", a sessão diz "sou eu".
 */
export const dynamic = "force-dynamic";

export default async function PresencaPage(props: {
  params: Promise<{ sessaoId: string; codigo: string }>;
}) {
  const { sessaoId, codigo } = await props.params;
  const usuario = await requireUser();

  const sessao = await db.sessaoPresencial.findUnique({
    where: { id: sessaoId },
    select: {
      id: true,
      titulo: true,
      instrutor: true,
      local: true,
      realizadaEm: true,
      abertaAte: true,
      encerradaEm: true,
      course: { select: { title: true } },
    },
  });
  if (!sessao) notFound();

  const situacao = situacaoDaSessao(sessao, new Date());

  const jaPresente = await db.presencaEmSessao.findUnique({
    where: { sessaoId_userId: { sessaoId, userId: usuario.id } },
    select: { registradaEm: true },
  });

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-wide text-ink-700/60">Lista de presença</p>
        <h1 className="mt-1 text-xl font-semibold text-ink-900">{sessao.course.title}</h1>
        {sessao.titulo && <p className="mt-0.5 text-sm text-ink-700/70">{sessao.titulo}</p>}

        <dl className="mt-4 space-y-1.5 text-sm text-ink-700">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-ink-700/50" />
            <dd>{sessao.instrutor}</dd>
          </div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 shrink-0 text-ink-700/50" />
            <dd>{formatDateTime(sessao.realizadaEm)}</dd>
          </div>
          {sessao.local && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-ink-700/50" />
              <dd>{sessao.local}</dd>
            </div>
          )}
        </dl>
      </div>

      {jaPresente ? (
        <Alert tone="success">
          Sua presença já está registrada, às {formatDateTime(jaPresente.registradaEm)}. Não
          precisa fazer de novo.
        </Alert>
      ) : situacao !== "aberta" ? (
        <Alert tone="warning">
          {situacao === "encerrada"
            ? "Esta lista já foi fechada pelo instrutor."
            : "O horário desta lista de presença terminou."}{" "}
          Se você participou do treinamento, procure quem o aplicou — dá para lançar a conclusão
          manualmente.
        </Alert>
      ) : (
        <>
          <ConfirmarPresenca sessaoId={sessao.id} codigo={codigo} />
          <p className="text-center text-xs text-ink-700/60">
            O código muda a cada 30 segundos. Se der erro, aponte a câmera de novo para a tela.
          </p>
        </>
      )}
    </div>
  );
}
