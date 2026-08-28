"use client";

import { useState } from "react";
import { ActionButton } from "@/components/shared/action-button";
import { Alert } from "@/components/ui/alert";
import {
  toggleEmployeeActive,
  resetEmployeePassword,
  generatePasswordResetLink,
} from "@/lib/actions/employees";

export function EmployeeStatusActions({ userId, active }: { userId: string; active: boolean }) {
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
      </div>
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
