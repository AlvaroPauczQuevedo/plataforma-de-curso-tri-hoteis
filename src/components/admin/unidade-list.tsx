"use client";

import { Hotel, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { excluirUnidade } from "@/lib/actions/unidades";

export type UnidadeNaTela = {
  id: string;
  name: string;
  /** Quem tem este hotel como principal. */
  usuarios: number;
  /** Quem o tem como adicional — atende aqui, mas conta em outro lugar. */
  extras: number;
};

/**
 * Lista de unidades, com exclusão para o proprietário.
 *
 * Espelha a lista de departamentos: o botão só aparece para quem pode excluir e
 * só fica ativo quando a unidade está vazia. Oferecer o botão, deixar a pessoa
 * confirmar e só então recusar é a pior sequência possível.
 */
export function UnidadeList({
  unidades,
  podeExcluir,
}: {
  unidades: UnidadeNaTela[];
  podeExcluir: boolean;
}) {
  if (unidades.length === 0) {
    return (
      <p className="py-2.5 text-sm text-ink-700/60">
        Nenhum hotel cadastrado ainda. Cadastre as unidades antes de vincular funcionários
        — assim cada pessoa já nasce no lugar certo.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {unidades.map((u) => {
        const vinculos = u.usuarios + u.extras;
        const detalhe = [
          u.usuarios > 0 ? `${u.usuarios} funcionário(s)` : null,
          u.extras > 0 ? `${u.extras} que também atende(m) aqui` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Hotel className="h-4 w-4 shrink-0 text-ink-700/40" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{u.name}</p>
                <p className="text-xs text-ink-700/60">{detalhe || "sem ninguém vinculado"}</p>
              </div>
            </div>

            {podeExcluir && (
              <span className="shrink-0">
                {vinculos === 0 ? (
                  <ActionButton
                    action={() => excluirUnidade(u.id)}
                    variant="ghost"
                    size="sm"
                    confirmMessage={`Excluir o hotel "${u.name}"?`}
                  >
                    <Trash2 className="h-4 w-4 text-danger-600" />
                  </ActionButton>
                ) : (
                  /*
                    O motivo no lugar de um botão desabilitado e mudo — mesma
                    escolha da lista de departamentos: quem quer excluir precisa
                    saber o que esvaziar primeiro.
                  */
                  <span
                    className="text-xs text-ink-700/40"
                    title="Mova as pessoas para outro hotel antes de excluir"
                  >
                    em uso
                  </span>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
