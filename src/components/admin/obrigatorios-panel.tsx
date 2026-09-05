"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import {
  removerObrigatoriedade,
  tornarObrigatorio,
} from "@/lib/actions/obrigatorios";

type Obrigatoriedade = {
  departmentId: string;
  departamento: string;
  prazoDias: number | null;
  validadeMeses: number | null;
  matriculados: number;
};

const campoClasse =
  "rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

/**
 * Marca o curso como obrigatório para departamentos inteiros.
 *
 * Cada linha aqui vale por todo mundo do departamento — inclusive quem for
 * contratado depois, que já entra matriculado.
 */
export function ObrigatoriosPanel({
  courseId,
  disponiveis,
  atuais,
}: {
  courseId: string;
  /** Departamentos que este administrador pode obrigar. */
  disponiveis: { id: string; name: string }[];
  atuais: Obrigatoriedade[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [departamento, setDepartamento] = useState("");
  const [prazo, setPrazo] = useState("");
  const [validade, setValidade] = useState("");

  const jaUsados = new Set(atuais.map((a) => a.departmentId));
  const restantes = disponiveis.filter((d) => !jaUsados.has(d.id));

  function adicionar() {
    if (!departamento) {
      setErro("Escolha um departamento.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const dias = prazo.trim() === "" ? null : Number(prazo);
      const meses = validade.trim() === "" ? null : Number(validade);
      const r = await tornarObrigatorio(courseId, departamento, dias, meses);
      if (!r.ok) setErro(r.error);
      else {
        setDepartamento("");
        setPrazo("");
        setValidade("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {atuais.length === 0 ? (
        <p className="text-sm text-ink-700/60">
          Este curso não é obrigatório para nenhum departamento. Enquanto for assim,
          as matrículas continuam sendo feitas uma a uma.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {atuais.map((o) => (
            <li
              key={o.departmentId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium text-ink-900">{o.departamento}</p>
                <p className="text-xs text-ink-700/60">
                  {o.matriculados} funcionário(s) ativo(s) ·{" "}
                  {o.prazoDias ? `prazo de ${o.prazoDias} dia(s)` : "sem prazo"}
                  {o.validadeMeses
                    ? ` · reciclagem a cada ${o.validadeMeses} mês(es)`
                    : " · sem reciclagem"}
                </p>
              </div>
              <ActionButton
                action={removerObrigatoriedade.bind(null, courseId, o.departmentId)}
                variant="ghost"
                size="sm"
                confirmMessage={
                  "Retirar a obrigatoriedade para este departamento? " +
                  "Quem já está matriculado continua matriculado — nada de progresso " +
                  "ou certificado é apagado."
                }
              >
                <X className="h-4 w-4" />
                Retirar
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      {restantes.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-muted/50 p-4">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label htmlFor="obrig-dep" className="text-xs font-medium text-ink-900">
              Obrigatório para
            </label>
            <select
              id="obrig-dep"
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              className={`w-full ${campoClasse}`}
            >
              <option value="">Escolha um departamento</option>
              {restantes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-32 space-y-1.5">
            <label htmlFor="obrig-prazo" className="text-xs font-medium text-ink-900">
              Prazo (dias)
            </label>
            <input
              id="obrig-prazo"
              type="number"
              min={1}
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              placeholder="sem prazo"
              className={`w-full ${campoClasse}`}
            />
          </div>

          <div className="w-36 space-y-1.5">
            <label htmlFor="obrig-validade" className="text-xs font-medium text-ink-900">
              Reciclagem (meses)
            </label>
            <input
              id="obrig-validade"
              type="number"
              min={1}
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              placeholder="não vence"
              className={`w-full ${campoClasse}`}
              title="De quantos em quantos meses o treinamento precisa ser refeito. Em branco, o certificado vale para sempre."
            />
          </div>

          <Button onClick={adicionar} disabled={pendente}>
            <Plus className="h-4 w-4" />
            {pendente ? "Matriculando..." : "Tornar obrigatório"}
          </Button>
        </div>
      )}

      {erro && <Alert tone="danger">{erro}</Alert>}

      <p className="text-xs text-ink-700/50">
        <Badge tone="navy">Como funciona</Badge> Ao marcar, todos os funcionários
        ativos do departamento são matriculados na hora. Quem for cadastrado ou
        transferido para lá depois entra automaticamente.
      </p>
    </div>
  );
}
