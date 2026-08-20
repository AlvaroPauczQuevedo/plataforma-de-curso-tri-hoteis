"use client";

import { useState } from "react";
import { ActionButton } from "@/components/shared/action-button";
import { Alert } from "@/components/ui/alert";
import { toggleEmployeeActive, resetEmployeePassword } from "@/lib/actions/employees";

export function EmployeeStatusActions({ userId, active }: { userId: string; active: boolean }) {
  const [message, setMessage] = useState<string | null>(null);

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
          onSuccess={(res) => setMessage(res.message ?? null)}
        >
          {active ? "Desativar acesso" : "Ativar acesso"}
        </ActionButton>
        <ActionButton
          action={() => resetEmployeePassword(userId)}
          variant="outline"
          confirmMessage="Gerar uma nova senha temporária para este funcionário?"
          onSuccess={(res) => setMessage(res.message ?? null)}
        >
          Redefinir senha
        </ActionButton>
      </div>
      {message && <Alert tone="success">{message}</Alert>}
    </div>
  );
}
