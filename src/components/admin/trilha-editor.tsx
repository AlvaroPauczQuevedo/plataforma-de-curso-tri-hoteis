"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import {
  adicionarCursoNaTrilha,
  atribuirTrilha,
  desatribuirTrilha,
  excluirTrilha,
  publicarTrilha,
  removerCursoDaTrilha,
  reordenarTrilha,
} from "@/lib/actions/trilhas";

export type DegrauDaTrilha = { id: string; courseId: string; titulo: string };
export type AtribuicaoDaTrilha = { departmentId: string; nome: string; prazoDias: number | null };

/**
 * Montagem da trilha: degraus em ordem, a quem ela é obrigatória, e publicar.
 *
 * Setas em vez de arrastar. Arrastar é mais bonito e some no celular, que é
 * onde metade desta rede administra — e reordenar treinamento obrigatório
 * errando o alvo por um dedo é o tipo de engano que ninguém percebe
 * acontecendo.
 */
export function TrilhaEditor({
  trilhaId,
  publicada,
  degraus,
  atribuicoes,
  cursosDisponiveis,
  departamentosDisponiveis,
}: {
  trilhaId: string;
  publicada: boolean;
  degraus: DegrauDaTrilha[];
  atribuicoes: AtribuicaoDaTrilha[];
  cursosDisponiveis: { id: string; title: string }[];
  departamentosDisponiveis: { id: string; name: string }[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function rodar(acao: () => Promise<{ ok: boolean; error?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await acao();
      if (!res.ok) {
        setErro(res.error ?? "Não foi possível concluir a ação.");
        return;
      }
      router.refresh();
    });
  }

  /** Troca o degrau de lugar com o vizinho e manda a ordem inteira. */
  function mover(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= degraus.length) return;

    const ids = degraus.map((d) => d.id);
    [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
    rodar(() => reordenarTrilha(trilhaId, ids));
  }

  const jaNaTrilha = new Set(degraus.map((d) => d.courseId));
  const jaAtribuidos = new Set(atribuicoes.map((a) => a.departmentId));
  const cursosParaAdicionar = cursosDisponiveis.filter((c) => !jaNaTrilha.has(c.id));
  const setoresParaAtribuir = departamentosDisponiveis.filter((d) => !jaAtribuidos.has(d.id));

  return (
    <div className="space-y-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      {/* ------------------------------------------------------- os degraus */}
      <div>
        <h3 className="text-sm font-medium text-ink-900">Degraus, na ordem</h3>

        {degraus.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/60">
            Nenhum curso ainda. Uma trilha sem degrau não pode ser publicada.
          </p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {degraus.map((degrau, indice) => (
              <li
                key={degrau.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink-700">
                  {indice + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{degrau.titulo}</span>

                <button
                  type="button"
                  onClick={() => mover(indice, -1)}
                  disabled={pendente || indice === 0}
                  aria-label={`Subir ${degrau.titulo}`}
                  className="rounded-lg p-1.5 text-ink-700/60 transition hover:bg-surface-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(indice, 1)}
                  disabled={pendente || indice === degraus.length - 1}
                  aria-label={`Descer ${degrau.titulo}`}
                  className="rounded-lg p-1.5 text-ink-700/60 transition hover:bg-surface-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => rodar(() => removerCursoDaTrilha(trilhaId, degrau.courseId))}
                  disabled={pendente}
                  aria-label={`Remover ${degrau.titulo}`}
                  className="rounded-lg p-1.5 text-ink-700/60 transition hover:bg-danger-100 hover:text-danger-600 disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        )}

        {cursosParaAdicionar.length > 0 && (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const courseId = String(new FormData(e.currentTarget).get("courseId") ?? "");
              if (courseId) rodar(() => adicionarCursoNaTrilha(trilhaId, courseId));
            }}
          >
            <select
              name="courseId"
              defaultValue=""
              required
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Acrescentar um curso ao fim…
              </option>
              {cursosParaAdicionar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </form>
        )}
      </div>

      {/* ---------------------------------------------------- a quem cabe */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium text-ink-900">Obrigatória para</h3>
        <p className="mt-0.5 text-xs text-ink-700/60">
          Atribuir matricula a equipe em todos os cursos da trilha. Tirar a atribuição não
          desmatricula ninguém.
        </p>

        {atribuicoes.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {atribuicoes.map((a) => (
              <li
                key={a.departmentId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-ink-800"
              >
                {a.nome}
                <span className="text-ink-700/50">
                  {a.prazoDias === null ? "sem prazo" : `${a.prazoDias} dias`}
                </span>
                <button
                  type="button"
                  onClick={() => rodar(() => desatribuirTrilha(trilhaId, a.departmentId))}
                  disabled={pendente}
                  aria-label={`Remover ${a.nome}`}
                  className="rounded-full p-0.5 text-ink-700/50 transition hover:bg-danger-100 hover:text-danger-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {setoresParaAtribuir.length > 0 && (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const dados = new FormData(e.currentTarget);
              const departmentId = String(dados.get("departmentId") ?? "");
              const prazoBruto = String(dados.get("prazoDias") ?? "").trim();
              if (!departmentId) return;
              // Campo vazio é "sem prazo", e não zero: zero venceria hoje.
              rodar(() =>
                atribuirTrilha(trilhaId, departmentId, prazoBruto === "" ? null : Number(prazoBruto))
              );
            }}
          >
            <select
              name="departmentId"
              defaultValue=""
              required
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Atribuir a um setor…
              </option>
              {setoresParaAtribuir.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              name="prazoDias"
              type="number"
              min={1}
              placeholder="prazo (dias)"
              className="w-32 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
            <Button type="submit" variant="outline" size="sm" disabled={pendente}>
              Atribuir
            </Button>
          </form>
        )}
      </div>

      {/* -------------------------------------------------- publicar/excluir */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <ActionButton
          action={() => publicarTrilha(trilhaId, !publicada)}
          variant={publicada ? "outline" : "primary"}
          confirmMessage={
            publicada
              ? "Despublicar tira a trilha da tela da equipe. Quem já foi matriculado continua matriculado."
              : "Publicar matricula a equipe dos setores atribuídos em todos os cursos desta trilha. Confirma?"
          }
        >
          {publicada ? "Despublicar" : "Publicar"}
        </ActionButton>

        {/*
          Excluir só aparece em rascunho sem atribuição. A action recusa de
          qualquer jeito; esconder o botão evita oferecer um caminho que
          termina em recusa.
        */}
        {!publicada && atribuicoes.length === 0 && (
          <ActionButton
            action={() => excluirTrilha(trilhaId)}
            variant="danger"
            confirmMessage="Excluir esta trilha? Os cursos e o progresso de todo mundo continuam intactos."
          >
            Excluir
          </ActionButton>
        )}
      </div>
    </div>
  );
}
