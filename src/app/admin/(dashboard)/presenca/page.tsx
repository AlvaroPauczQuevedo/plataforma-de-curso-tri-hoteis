import { QrCode } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { carregarAtorOuFalhar } from "@/lib/alcance-admin";
import { situacaoDaSessao } from "@/lib/presenca";
import { enderecoPublico } from "@/lib/email";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QrDaSessao } from "@/components/admin/qr-da-sessao";
import { PresencaAoVivo } from "@/components/admin/presenca-ao-vivo";
import { SessaoPresencialForm } from "@/components/admin/sessao-presencial-form";
import {
  EncerrarSessao,
  RemoverDaLista,
} from "@/components/admin/sessao-presencial-acoes";
import { formatDateTime } from "@/lib/utils";

/**
 * Check-in presencial por QR.
 *
 * O treinamento em sala já era reconhecido, mas lançado à mão — trinta nomes,
 * um a um, e é aí que alguém fica de fora sem ninguém notar. Aqui o instrutor
 * projeta o código, a turma aponta a câmera, e ele encerra quando acabar.
 *
 * O encerramento é que grava as conclusões. Até lá a lista é rascunho: um bipe
 * errado é uma linha para remover, não um "fulano está treinado em brigada de
 * incêndio" que depois alguém precisa descobrir que é falso.
 */
export const dynamic = "force-dynamic";

const LIMITE_DE_SESSOES = 30;

export default async function PresencaAdminPage() {
  const admin = await requireAdmin();
  const ator = await carregarAtorOuFalhar(admin.id);

  const alcanca = (departmentId: string | null) =>
    ator.protegido || (departmentId !== null && ator.departamentos.includes(departmentId));

  const [sessoes, cursos, eu] = await Promise.all([
    db.sessaoPresencial.findMany({
      orderBy: { createdAt: "desc" },
      take: LIMITE_DE_SESSOES,
      select: {
        id: true,
        titulo: true,
        instrutor: true,
        local: true,
        realizadaEm: true,
        abertaAte: true,
        encerradaEm: true,
        course: { select: { id: true, title: true, departmentId: true } },
        presencas: {
          orderBy: { registradaEm: "asc" },
          select: {
            userId: true,
            registradaEm: true,
            user: { select: { name: true, username: true } },
          },
        },
      },
    }),
    db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, departmentId: true },
    }),
    db.user.findUnique({ where: { id: admin.id }, select: { name: true } }),
  ]);

  const agora = new Date();
  const minhas = sessoes.filter((s) => alcanca(s.course.departmentId));
  const temAberta = minhas.some((s) => situacaoDaSessao(s, agora) === "aberta");
  const endereco = enderecoPublico();

  return (
    <div className="space-y-6">
      {/* Enquanto houver sessão aberta, a tela se atualiza sozinha. */}
      <PresencaAoVivo ativo={temAberta} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Presença</h1>
          <p className="mt-1 text-sm text-ink-700/70">
            Treinamento em sala: projete o código, a turma aponta a câmera. O código muda a cada
            30 segundos — a foto mandada no grupo não serve.
          </p>
        </div>

        <SessaoPresencialForm
          cursos={cursos.filter((c) => alcanca(c.departmentId))}
          instrutorPadrao={eu?.name ?? ""}
        />
      </div>

      {minhas.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="Nenhuma lista de presença"
          description="Abra uma quando for aplicar um treinamento presencial — brigada de incêndio, manipulação de alimentos, as NRs."
        />
      ) : (
        <div className="space-y-4">
          {minhas.map((sessao) => {
            const situacao = situacaoDaSessao(sessao, agora);

            return (
              <section
                key={sessao.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-ink-900">{sessao.course.title}</h2>
                      {situacao === "aberta" && <Badge tone="success">Aberta</Badge>}
                      {situacao === "expirada" && <Badge tone="warning">Horário encerrado</Badge>}
                      {situacao === "encerrada" && <Badge tone="neutral">Encerrada</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-700/70">
                      {sessao.titulo ? `${sessao.titulo} · ` : ""}
                      {sessao.instrutor}
                      {sessao.local ? ` · ${sessao.local}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink-700/50">
                      {formatDateTime(sessao.realizadaEm)} ·{" "}
                      <strong className="font-medium text-ink-900">
                        {sessao.presencas.length}
                      </strong>{" "}
                      presente(s)
                    </p>
                  </div>

                  {situacao !== "encerrada" && (
                    <EncerrarSessao sessaoId={sessao.id} presentes={sessao.presencas.length} />
                  )}
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[auto_1fr]">
                  {situacao === "aberta" ? (
                    <QrDaSessao sessaoId={sessao.id} endereco={endereco} />
                  ) : (
                    <div className="flex aspect-square w-full max-w-xs items-center justify-center rounded-2xl border border-dashed border-border text-center text-sm text-ink-700/50">
                      {situacao === "encerrada"
                        ? "Lista encerrada. As conclusões já foram registradas."
                        : "O horário terminou. Ninguém mais consegue bipar."}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-ink-900">
                      Quem marcou presença
                    </h3>

                    {sessao.presencas.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-700/60">
                        Ninguém ainda. Os nomes aparecem aqui conforme a turma bipa.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-border">
                        {sessao.presencas.map((p) => (
                          <li
                            key={p.userId}
                            className="flex items-center justify-between gap-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-ink-900">{p.user.name}</p>
                              <p className="text-xs text-ink-700/50">
                                {p.user.username} · {formatDateTime(p.registradaEm)}
                              </p>
                            </div>

                            {/*
                              Remover só antes de encerrar. Depois, a linha virou
                              conclusão registrada, e apagá-la aqui deixaria a
                              conclusão sem a origem que a explica.
                            */}
                            {situacao !== "encerrada" && (
                              <RemoverDaLista
                                sessaoId={sessao.id}
                                userId={p.userId}
                                nome={p.user.name}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
