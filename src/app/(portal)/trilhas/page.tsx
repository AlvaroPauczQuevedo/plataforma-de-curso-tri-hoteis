import Link from "next/link";
import { CheckCircle2, Lock, Route, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { trilhasDaPessoa } from "@/lib/trilhas";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * As trilhas desta pessoa: os cursos na ordem em que devem ser feitos.
 *
 * O degrau trancado **aparece**, cinza e sem link. Não some, e é de propósito:
 * a pessoa precisa ver o caminho inteiro para saber onde está e quanto falta.
 * Esconder o que vem depois transformaria a trilha numa fila de surpresas.
 */
export const dynamic = "force-dynamic";

export default async function TrilhasPage() {
  const user = await requireUser();
  const trilhas = await trilhasDaPessoa(user.id);

  const emAndamento = trilhas.filter((t) => !t.progresso.completa).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Trilhas</h1>
        <p className="mt-1 text-sm text-ink-700/70">
          {emAndamento > 0
            ? `Você tem ${emAndamento} trilha(s) em andamento. Faça na ordem: cada curso abre o próximo.`
            : "Você concluiu todas as suas trilhas."}
        </p>
      </div>

      {trilhas.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Nenhuma trilha por aqui"
          description="Quando o setor de treinamento montar uma sequência de cursos para a sua área, ela aparece nesta tela."
        />
      ) : (
        <div className="space-y-5">
          {trilhas.map((trilha) => (
            <section key={trilha.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-ink-900">{trilha.titulo}</h2>
                    {trilha.progresso.completa && <Badge tone="success">Concluída</Badge>}
                  </div>
                  {trilha.descricao && (
                    <p className="mt-1 text-sm text-ink-700/70">{trilha.descricao}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <ProgressBar percent={trilha.progresso.percent} size="sm" className="w-28" />
                  <span className="text-xs tabular-nums text-ink-700/60">
                    {trilha.progresso.concluidos} de {trilha.progresso.total}
                  </span>
                </div>
              </div>

              <ol className="mt-4 space-y-2 border-t border-border pt-4">
                {trilha.degraus.map((degrau, indice) => {
                  const numero = indice + 1;

                  /*
                    Só o degrau liberado ou concluído vira link. O trancado é um
                    `div`: sem endereço para clicar, sem cursor de link, sem
                    promessa que a tela não cumpre.
                  */
                  const conteudo = (
                    <>
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          degrau.situacao === "concluido"
                            ? "bg-success-100 text-success-600"
                            : degrau.situacao === "liberado"
                              ? "bg-brand-100 text-brand-texto"
                              : "bg-surface-muted text-ink-700/40"
                        }`}
                      >
                        {degrau.situacao === "concluido" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : degrau.situacao === "trancado" ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : (
                          numero
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-medium ${
                            degrau.situacao === "trancado" ? "text-ink-700/40" : "text-ink-900"
                          }`}
                        >
                          {degrau.titulo}
                        </span>

                        <span className="mt-0.5 block text-xs text-ink-700/60">
                          {degrau.situacao === "concluido" && (
                            <span className="inline-flex items-center gap-1 text-success-600">
                              Concluído
                              {/*
                                Presencial ganha selo próprio. Quem fez a brigada
                                numa sala precisa ver que a plataforma sabe disso
                                — senão abre um chamado perguntando por que a
                                trilha não reconheceu o treinamento.
                              */}
                              {degrau.presencial && (
                                <span className="inline-flex items-center gap-1 text-ink-700/60">
                                  <UserCheck className="h-3 w-3" />
                                  presencial
                                </span>
                              )}
                            </span>
                          )}
                          {degrau.situacao === "liberado" &&
                            (degrau.percent > 0 ? `Em andamento — ${degrau.percent}%` : "Comece por aqui")}
                          {degrau.situacao === "trancado" && "Conclua o curso anterior para abrir"}
                          {!degrau.matriculado && degrau.situacao !== "concluido" && (
                            <span className="ml-1 text-warning-600">· matrícula pendente</span>
                          )}
                        </span>
                      </span>
                    </>
                  );

                  const classe =
                    "flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition";

                  return (
                    <li key={degrau.courseId}>
                      {degrau.situacao === "trancado" || !degrau.matriculado ? (
                        <div className={`${classe} bg-surface-muted/40`} aria-disabled="true">
                          {conteudo}
                        </div>
                      ) : (
                        <Link href={`/cursos/${degrau.courseId}`} className={`${classe} hover:bg-surface-muted`}>
                          {conteudo}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
