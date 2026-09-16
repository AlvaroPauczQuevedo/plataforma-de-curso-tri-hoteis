"use client";

import { X } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { encerrarSessaoPresencial, removerPresenca } from "@/lib/actions/presenca";

/**
 * Os botões da sessão, do lado do cliente.
 *
 * Existem como componente próprio por uma restrição real do App Router: uma
 * função criada num Server Component não pode ser passada para um Client
 * Component. `ActionButton` recebe `action` como closure — `() => encerrar(id)`
 * —, então quem o usa precisa ser cliente também.
 *
 * A tela de presença é um Server Component (ela consulta o banco direto), e a
 * primeira versão passava as closures de lá. O build passou, os tipos
 * passaram, e a página devolveu 500 em execução: é um erro de serialização, e
 * só aparece quando a rota é de fato chamada.
 */

export function EncerrarSessao({
  sessaoId,
  presentes,
}: {
  sessaoId: string;
  presentes: number;
}) {
  return (
    <ActionButton
      action={() => encerrarSessaoPresencial(sessaoId)}
      variant="primary"
      confirmMessage={
        presentes === 0
          ? "Ninguém bipou nesta lista. Encerrar assim mesmo?"
          : `Encerrar registra a conclusão de ${presentes} pessoa(s) neste treinamento. Confira a lista antes — depois disso ela vira registro de conformidade.`
      }
    >
      Encerrar e registrar
    </ActionButton>
  );
}

export function RemoverDaLista({
  sessaoId,
  userId,
  nome,
}: {
  sessaoId: string;
  userId: string;
  nome: string;
}) {
  return (
    <ActionButton
      action={() => removerPresenca(sessaoId, userId)}
      variant="ghost"
      size="sm"
      confirmMessage={`Tirar ${nome} da lista?`}
    >
      <X className="h-4 w-4" />
    </ActionButton>
  );
}
