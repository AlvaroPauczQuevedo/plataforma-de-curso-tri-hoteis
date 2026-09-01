"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { Alert } from "@/components/ui/alert";
import {
  toggleEmployeeActive,
  resetEmployeePassword,
  generatePasswordResetLink,
  deleteEmployee,
} from "@/lib/actions/employees";

/** O que a exclusão levaria junto. Vem contado do servidor. */
export type ImpactoDaExclusao = {
  matriculas: number;
  certificados: number;
  tentativas: number;
  atividades: number;
  autoria: number;
  historico: number;
};

export function EmployeeStatusActions({
  userId,
  nome,
  active,
  impacto,
}: {
  userId: string;
  nome: string;
  active: boolean;
  impacto: ImpactoDaExclusao;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  function show(message: string | null, link?: string) {
    setMessage(message);
    setResetLink(link ?? null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          action={() => toggleEmployeeActive(userId, !active)}
          variant={active ? "danger" : "primary"}
          confirmMessage={
            active
              ? "Desativar o acesso deste funcionário? O histórico será mantido."
              : "Reativar o acesso deste funcionário?"
          }
          onSuccess={(res) => show(res.message ?? null)}
        >
          {active ? "Desativar acesso" : "Ativar acesso"}
        </ActionButton>
        <ActionButton
          action={() => resetEmployeePassword(userId)}
          variant="outline"
          confirmMessage="Gerar uma nova senha temporária para este funcionário?"
          onSuccess={(res) => show(res.message ?? null)}
        >
          Redefinir senha
        </ActionButton>
        <ActionButton
          action={generatePasswordResetLink.bind(null, userId)}
          variant="outline"
          confirmMessage="Gerar um link para o funcionário escolher a própria senha?"
          onSuccess={(res) =>
            show(res.message ?? null, (res as { resetLink?: string }).resetLink)
          }
        >
          Gerar link de redefinição
        </ActionButton>

        <ActionButton
          action={async () => {
            const res = await deleteEmployee(userId);
            if (res.ok) router.push("/admin/funcionarios");
            return res;
          }}
          variant="danger"
          confirmMessage={mensagemDeExclusao(nome, impacto)}
        >
          <Trash2 className="h-4 w-4" />
          Excluir conta
        </ActionButton>
      </div>

      <p className="text-xs leading-relaxed text-ink-700/60">
        Na dúvida, prefira <strong>desativar</strong>: o acesso é bloqueado na hora e
        o histórico de treinamento continua existindo, que é o que a auditoria pede.
        Excluir é para conta criada por engano.
      </p>
      {message && (
        <Alert tone="success">
          <p>{message}</p>
          {resetLink && (
            <p className="mt-2 break-all font-mono text-xs">
              {resetLink}
              <span className="mt-1 block font-sans text-ink-700/70">
                Envie este endereço ao funcionário pelo canal interno.
              </span>
            </p>
          )}
        </Alert>
      )}
    </div>
  );
}

/**
 * Confirmação que declara o tamanho do estrago.
 *
 * Um "tem certeza?" genérico não informa nada — quem clica em excluir já tem
 * certeza. O que a pessoa não sabe é quantos certificados vão junto.
 */
function mensagemDeExclusao(nome: string, impacto: ImpactoDaExclusao) {
  if (impacto.historico === 0) {
    return `Excluir a conta de ${nome}? Ela não tem histórico registrado.`;
  }

  const partes: string[] = [];
  if (impacto.matriculas > 0) partes.push(`${impacto.matriculas} matrícula(s)`);
  if (impacto.certificados > 0) partes.push(`${impacto.certificados} certificado(s)`);
  if (impacto.tentativas > 0) partes.push(`${impacto.tentativas} nota(s) de prova`);
  if (impacto.atividades > 0) partes.push(`${impacto.atividades} registro(s) de atividade`);

  return (
    `Excluir a conta de ${nome} apaga em definitivo: ${partes.join(", ")}. ` +
    "Isso não pode ser desfeito. Desativar preserva tudo isso."
  );
}
