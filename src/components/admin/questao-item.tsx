"use client";

import { useState } from "react";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { QuestaoForm } from "@/components/admin/questao-form";
import { deleteQuestao } from "@/lib/actions/provas";

type Alternativa = { id: string; texto: string; correta: boolean };

/**
 * Uma questão na lista do administrador: ver, corrigir ou excluir.
 *
 * A correção acontece no lugar, sem trocar de tela, porque conferir gabarito é
 * uma leitura em sequência — quem revisa a prova percorre as questões de cima
 * a baixo, e sair da página a cada ajuste faz perder o fio.
 *
 * Excluir continua existindo, mas deixou de ser o único caminho para consertar
 * uma alternativa errada. Era, e por isso um gabarito errado custava a questão
 * inteira e o histórico junto.
 */
export function QuestaoItem({
  numero,
  questao,
  provaId,
}: {
  numero: number;
  questao: { id: string; enunciado: string; alternativas: Alternativa[] };
  provaId: string;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li className="rounded-2xl border border-brand-600/40 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-700">
            Corrigindo a questão {numero}
          </span>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-xs font-medium text-ink-700/60 hover:underline"
          >
            Cancelar
          </button>
        </div>

        <QuestaoForm
          provaId={provaId}
          questao={questao}
          aoConcluir={() => setEditando(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-900">
          {numero}. {questao.enunciado}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            aria-label={`Corrigir a questão ${numero}`}
            className="rounded-lg p-1.5 text-ink-700/60 transition hover:bg-surface-muted hover:text-brand-700"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <ActionButton
            action={deleteQuestao.bind(null, questao.id)}
            variant="ghost"
            size="sm"
            confirmMessage="Excluir esta questão? Para trocar uma alternativa, use o lápis — excluir apaga a questão inteira."
          >
            <Trash2 className="h-4 w-4 text-danger-600" />
          </ActionButton>
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {questao.alternativas.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm text-ink-700/80">
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
  );
}
