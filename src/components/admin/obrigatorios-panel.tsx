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
  tornarObrigatorioEmLote,
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
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [prazo, setPrazo] = useState("");
  const [validade, setValidade] = useState("");

  const jaUsados = new Set(atuais.map((a) => a.departmentId));
  const restantes = disponiveis.filter((d) => !jaUsados.has(d.id));

  function alternar(id: string) {
    setEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    );
  }

  function adicionar() {
    if (escolhidos.length === 0) {
      setErro("Escolha ao menos um setor.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      // Campo vazio é "sem prazo"/"não vence", e não zero: zero venceria hoje.
      const dias = prazo.trim() === "" ? null : Number(prazo);
      const meses = validade.trim() === "" ? null : Number(validade);
      const r = await tornarObrigatorioEmLote(courseId, escolhidos, dias, meses);
      if (!r.ok) setErro(r.error);
      else {
        setEscolhidos([]);
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
          {/*
            Caixas de seleção, e não uma lista suspensa de escolha única.
            Nesta rede o departamento é o hotel: marcar um curso para as 25
            casas eram 25 idas ao formulário, repetidas a cada curso novo.
          */}
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-900">Obrigatório para</span>

              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEscolhidos(restantes.map((d) => d.id))}
                  className="font-medium text-brand-texto hover:underline"
                >
                  Marcar todos ({restantes.length})
                </button>
                {escolhidos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEscolhidos([])}
                    className="text-ink-700/60 hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-border bg-surface p-2">
              {restantes.map((d) => (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-900 hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    checked={escolhidos.includes(d.id)}
                    onChange={() => alternar(d.id)}
                    className="h-4 w-4 rounded border-border accent-brand-600"
                  />
                  {d.name}
                </label>
              ))}
            </div>
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

          <Button onClick={adicionar} disabled={pendente || escolhidos.length === 0}>
            <Plus className="h-4 w-4" />
            {pendente
              ? "Matriculando..."
              : escolhidos.length > 1
                ? `Tornar obrigatório em ${escolhidos.length} setores`
                : "Tornar obrigatório"}
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
