"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ActionForm } from "@/components/shared/action-form";
import { addQuestao } from "@/lib/actions/provas";

const MINIMO = 2;
const MAXIMO = 6;

/**
 * Formulário de questão, com alternativas variáveis.
 *
 * A alternativa correta é escolhida por rádio, e não por caixa de marcação, de
 * propósito: uma questão tem uma resposta certa, e a interface deve tornar o
 * contrário impossível em vez de validar depois.
 */
export function QuestaoForm({ provaId }: { provaId: string }) {
  const [quantidade, setQuantidade] = useState(4);
  const [correta, setCorreta] = useState(0);

  const indices = Array.from({ length: quantidade }, (_, i) => i);

  return (
    <ActionForm
      submitLabel="Adicionar questão"
      resetOnSuccess
      action={async (formData) => {
        formData.set("corretaIndice", String(correta));
        const res = await addQuestao(provaId, formData);
        if (res.ok) setCorreta(0);
        return res;
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="enunciado" className="text-sm font-medium text-ink-900">
          Enunciado
        </label>
        <textarea
          id="enunciado"
          name="enunciado"
          required
          rows={2}
          placeholder="O que se pergunta?"
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-ink-900">
          Alternativas — marque a correta
        </span>

        {indices.map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <input
              type="radio"
              name="correta-visual"
              checked={correta === i}
              onChange={() => setCorreta(i)}
              aria-label={`Marcar alternativa ${i + 1} como correta`}
              className="h-4 w-4 shrink-0 border-border text-brand-700"
            />
            <input
              name="alternativa"
              required={i < MINIMO}
              placeholder={`Alternativa ${i + 1}`}
              className="w-full rounded-xl border border-border px-3.5 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
            {quantidade > MINIMO && i === quantidade - 1 && (
              <button
                type="button"
                onClick={() => {
                  setQuantidade((q) => q - 1);
                  if (correta === quantidade - 1) setCorreta(0);
                }}
                aria-label="Remover última alternativa"
                className="shrink-0 rounded-lg p-1.5 text-ink-700/50 transition hover:bg-surface-muted hover:text-danger-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {quantidade < MAXIMO && (
          <button
            type="button"
            onClick={() => setQuantidade((q) => q + 1)}
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
