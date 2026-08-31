"use client";

import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { deleteDepartment } from "@/lib/actions/employees";

export type DepartamentoNaTela = {
  id: string;
  name: string;
  usuarios: number;
  cursos: number;
  obrigatorios: number;
};

/**
 * Lista de departamentos, com exclusão para o proprietário.
 *
 * É um componente de cliente porque a ação precisa levar o id do departamento,
 * e uma página de servidor não consegue passar essa closure como propriedade.
 *
 * O botão só aparece para quem pode excluir e só fica ativo quando o
 * departamento está vazio. Esconder o que seria recusado evita a pior
 * experiência possível: oferecer um botão, deixar a pessoa confirmar e só
 * então dizer que não podia.
 */
export function DepartmentList({
  departamentos,
  podeExcluir,
}: {
  departamentos: DepartamentoNaTela[];
  podeExcluir: boolean;
}) {
  if (departamentos.length === 0) {
    return (
      <p className="py-2.5 text-sm text-ink-700/60">
        Nenhum departamento cadastrado ainda.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {departamentos.map((d) => {
        const vinculos = [
          d.usuarios > 0 ? `${d.usuarios} funcionário(s)` : null,
          d.cursos > 0 ? `${d.cursos} curso(s)` : null,
          d.obrigatorios > 0 ? `${d.obrigatorios} obrigatório(s)` : null,
        ].filter(Boolean);

        const vazio = vinculos.length === 0;

        return (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-900">{d.name}</span>

            <span className="shrink-0 text-xs text-ink-700/50">
              {vazio ? "vazio" : vinculos.join(" · ")}
            </span>

            {podeExcluir && (
              <span className="shrink-0">
                {vazio ? (
                  <ActionButton
                    action={() => deleteDepartment(d.id)}
                    variant="ghost"
                    size="sm"
                    confirmMessage={`Excluir o departamento "${d.name}"?`}
                  >
                    <Trash2 className="h-4 w-4 text-danger-600" />
                  </ActionButton>
                ) : (
                  /*
                    Em vez de um botão desabilitado sem explicação, o motivo:
                    quem quer excluir precisa saber o que esvaziar primeiro.
                  */
                  <span
                    className="text-xs text-ink-700/40"
                    title="Mova ou remova os vínculos antes de excluir"
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
