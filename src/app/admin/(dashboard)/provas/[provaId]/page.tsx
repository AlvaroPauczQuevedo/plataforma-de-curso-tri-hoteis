import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trash2, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { carregarAtorOuFalhar } from "@/lib/alcance-admin";
import { requireAdmin } from "@/lib/session";
import { motivoDeBloqueioDeProva } from "@/lib/permissoes-usuario";
import { motivoParaNaoPublicar } from "@/lib/prova";
import { deleteQuestao } from "@/lib/actions/provas";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/shared/action-button";
import { ProvaActions } from "@/components/admin/prova-actions";
import { ProvaForm } from "@/components/admin/prova-form";
import { QuestaoForm } from "@/components/admin/questao-form";

export default async function ProvaPage({ params }: { params: { provaId: string } }) {
  const admin = await requireAdmin();

  const prova = await db.prova.findUnique({
    where: { id: params.provaId },
    include: {
      department: true,
      questoes: {
        include: { alternativas: { orderBy: { ordem: "asc" } } },
        orderBy: { ordem: "asc" },
      },
      _count: { select: { tentativas: true } },
    },
  });

  if (!prova) notFound();

  const ator = await carregarAtorOuFalhar(admin.id);

  const motivo = motivoDeBloqueioDeProva(prova, ator);
  const impedimentoParaPublicar = motivoParaNaoPublicar(prova.questoes);

  const todosDepartamentos = await db.department.findMany({ orderBy: { name: "asc" } });
  const departamentos = ator.protegido ? todosDepartamentos : [];

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/provas"
        className="inline-flex items-center gap-1 text-sm text-ink-700/70 hover:text-ink-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">{prova.titulo}</h1>
        <Badge tone={prova.publicada ? "success" : "warning"}>
          {prova.publicada ? "Publicada" : "Rascunho"}
        </Badge>
        <span className="text-sm text-ink-700/60">
          {prova.department?.name ?? "Geral"} · {prova.questoes.length} questão(ões) ·{" "}
          {prova._count.tentativas} realização(ões)
        </span>
      </div>

      {motivo ? (
        <Alert tone="warning">{motivo}</Alert>
      ) : (
        <>
          <ProvaActions
            provaId={prova.id}
            titulo={prova.titulo}
            publicada={prova.publicada}
            tentativas={prova._count.tentativas}
          />

          {!prova.publicada && impedimentoParaPublicar && (
            <Alert tone="warning">{impedimentoParaPublicar}</Alert>
          )}

          <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold text-ink-900">Informações da prova</h2>
            <ProvaForm prova={prova} departamentos={departamentos} />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="font-semibold text-ink-900">Questões</h2>
              <p className="text-sm text-ink-700/70">
                Cada questão vale o mesmo peso. A nota é o percentual de acerto.
              </p>
            </div>

            {prova.questoes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-700/50">
                Nenhuma questão ainda.
              </p>
            ) : (
              <ol className="space-y-3">
                {prova.questoes.map((q, i) => (
                  <li
                    key={q.id}
                    className="rounded-2xl border border-border bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-ink-900">
                        {i + 1}. {q.enunciado}
                      </p>
                      <ActionButton
                        action={deleteQuestao.bind(null, q.id)}
                        variant="ghost"
                        size="sm"
                        confirmMessage="Excluir esta questão?"
                      >
                        <Trash2 className="h-4 w-4 text-danger-600" />
                      </ActionButton>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {q.alternativas.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 text-sm text-ink-700/80"
                        >
                          {a.correta ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
                          ) : (
                            <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
                          )}
                          {a.texto}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}

            <div className="rounded-2xl border border-border bg-white p-6">
              <h3 className="mb-3 font-semibold text-ink-900">Adicionar questão</h3>
              <QuestaoForm provaId={prova.id} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
