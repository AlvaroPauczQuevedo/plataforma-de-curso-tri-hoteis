"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ActionForm } from "@/components/shared/action-form";
import { addQuestao, updateQuestao } from "@/lib/actions/provas";

const MINIMO = 2;
const MAXIMO = 6;

type Alternativa = { id: string; texto: string; correta: boolean };

/**
 * Formulário de questão — o mesmo para escrever uma nova e para corrigir uma
 * existente.
 *
 * É um formulário só de propósito: escrever e corrigir uma questão obedecem às
 * mesmas regras (mínimo de duas alternativas, exatamente uma correta), e duas
 * telas para as mesmas regras acabam divergindo justamente na validação.
 *
 * A alternativa correta é escolhida por rádio, e não por caixa de marcação:
 * uma questão tem uma resposta certa, e a interface deve tornar o contrário
 * impossível em vez de validar depois.
 *
 * Na edição, cada alternativa carrega o próprio id num campo oculto. É o que
 * permite ao servidor casar texto com alternativa existente em vez de recriar
 * todas — as tentativas já realizadas apontam para esses ids.
 */
export function QuestaoForm({
  provaId,
  questao,
  aoConcluir,
}: {
  provaId: string;
  /** Ausente cria uma questão nova; presente corrige aquela. */
  questao?: { id: string; enunciado: string; alternativas: Alternativa[] };
  /** Chamado depois de salvar, para a tela sair do modo de edição. */
  aoConcluir?: () => void;
}) {
  const editando = Boolean(questao);

  const [linhas, setLinhas] = useState<Alternativa[]>(
    questao?.alternativas.length
      ? questao.alternativas
      : Array.from({ length: 4 }, () => ({ id: "", texto: "", correta: false }))
  );
  const [correta, setCorreta] = useState(
    Math.max(0, questao?.alternativas.findIndex((a) => a.correta) ?? 0)
  );

  return (
    <ActionForm
      submitLabel={editando ? "Salvar questão" : "Adicionar questão"}
      resetOnSuccess={!editando}
      action={async (formData) => {
        formData.set("corretaIndice", String(correta));

        const res = questao
          ? await updateQuestao(questao.id, formData)
          : await addQuestao(provaId, formData);

        if (res.ok) {
          if (!editando) {
            setCorreta(0);
            setLinhas(
              Array.from({ length: 4 }, () => ({ id: "", texto: "", correta: false }))
            );
          }
          aoConcluir?.();
        }
        return res;
      }}
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink-900">Enunciado</label>
        <textarea
          name="enunciado"
          required
          rows={2}
          defaultValue={questao?.enunciado ?? ""}
          placeholder="O que se pergunta?"
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-ink-900">
          Alternativas — marque a correta
        </span>

        {linhas.map((linha, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <input
              type="radio"
              name="correta-visual"
              checked={correta === i}
              onChange={() => setCorreta(i)}
              aria-label={`Marcar alternativa ${i + 1} como correta`}
              className="h-4 w-4 shrink-0 border-border text-brand-700"
            />
            {/* Vazio para alternativa nova; o servidor trata isso como criação. */}
            <input type="hidden" name="alternativaId" value={linha.id} />
            <input
              name="alternativa"
              required={i < MINIMO}
              defaultValue={linha.texto}
              placeholder={`Alternativa ${i + 1}`}
              className="w-full rounded-xl border border-border px-3.5 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
            {linhas.length > MINIMO && i === linhas.length - 1 && (
              <button
                type="button"
                onClick={() => {
                  setLinhas((l) => l.slice(0, -1));
                  if (correta === linhas.length - 1) setCorreta(0);
                }}
                aria-label="Remover última alternativa"
                className="shrink-0 rounded-lg p-1.5 text-ink-700/50 transition hover:bg-surface-muted hover:text-danger-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {linhas.length < MAXIMO && (
          <button
            type="button"
            onClick={() =>
              setLinhas((l) => [...l, { id: "", texto: "", correta: false }])
            }
            className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Mais uma alternativa
          </button>
        )}
      </div>
    </ActionForm>
  );
}
