"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { deleteProva, setProvaPublicada } from "@/lib/actions/provas";

/**
 * Publicar, despublicar e excluir uma prova.
 *
 * É um componente de cliente por duas razões, e ambas importam:
 *
 *  1. Excluir precisa SAIR da página. Sem isso, o botão apenas recarrega a
 *     tela atual — que já não encontra a prova recém-apagada e responde 404.
 *     Quem exclui vê um erro no lugar da confirmação de que deu certo.
 *
 *  2. Componente de servidor não consegue passar closure para componente de
 *     cliente. Aqui dentro a closure é natural e o `router` está disponível.
 */
export function ProvaActions({
  provaId,
  titulo,
  publicada,
  tentativas,
}: {
  provaId: string;
  titulo: string;
  publicada: boolean;
  /** Quantas realizações a exclusão destruiria. Vai na confirmação. */
  tentativas: number;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      {publicada ? (
        <ActionButton
          action={() => setProvaPublicada(provaId, false)}
          variant="secondary"
          confirmMessage="Despublicar? A prova sai da lista dos funcionários."
        >
          Mover para rascunho
        </ActionButton>
      ) : (
        <ActionButton
          action={() => setProvaPublicada(provaId, true)}
          variant="primary"
        >
          Publicar prova
        </ActionButton>
      )}

      <ActionButton
        action={async () => {
          const res = await deleteProva(provaId);
          if (res.ok) router.push("/admin/provas");
          return res;
        }}
        variant="danger"
        confirmMessage={
          tentativas > 0
            ? `"${titulo}" já foi realizada ${tentativas} vez(es). Excluir?`
            : `Excluir a prova "${titulo}"?`
        }
      >
        <Trash2 className="h-4 w-4" />
        Excluir
      </ActionButton>
    </div>
  );
}
