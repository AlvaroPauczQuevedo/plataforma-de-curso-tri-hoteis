"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Building2, AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sincronizarFuncionarios, type SyncResult } from "@/lib/actions/intranet";

/**
 * Traz o cadastro de pessoas da intranet.
 *
 * Só é renderizado quando a integração está configurada (ver a página de
 * Funcionários): numa instalação sem intranet, a plataforma não deve exibir
 * um botão para um sistema que não existe.
 *
 * As senhas provisórias aparecem uma única vez, logo após a sincronização —
 * elas não ficam guardadas em lugar nenhum, só o hash vai para o banco. Por
 * isso o aviso para anotá-las antes de sair da tela.
 */
export function IntranetSyncPanel() {
  const [pendente, iniciarTransicao] = useTransition();
  const [resultado, setResultado] = useState<SyncResult | null>(null);
  const router = useRouter();

  function sincronizar() {
    iniciarTransicao(async () => {
      const resposta = await sincronizarFuncionarios();
      setResultado(resposta);
      if (resposta.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-medium text-ink-900">Cadastro da intranet</h2>
            <p className="max-w-xl text-sm text-ink-700/70">
              A intranet é a dona do cadastro de pessoas. A sincronização traz os funcionários de
              lá com a mesma matrícula, atualiza cargo e setor, e desativa quem foi desligado —
              sempre preservando o histórico de treinamento.
            </p>
          </div>
        </div>
        <Button onClick={sincronizar} disabled={pendente}>
          <RefreshCw className={`h-4 w-4 ${pendente ? "animate-spin" : ""}`} />
          {pendente ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </div>

      {resultado && !resultado.ok && (
        <div className="mt-4">
          <Alert tone="danger">{resultado.error}</Alert>
        </div>
      )}

      {resultado?.ok && (
        <div className="mt-4 space-y-4">
          <Alert tone="success">
            {resultado.resumo.criados.length} conta(s) criada(s),{" "}
            {resultado.resumo.atualizados} atualizada(s), {resultado.resumo.desativados}{" "}
            desativada(s).
          </Alert>

          {resultado.resumo.criados.length > 0 && (
            <div className="rounded-xl border border-warning-600/30 bg-warning-600/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-warning-600">
                <AlertTriangle className="h-4 w-4" />
                Anote as senhas provisórias antes de sair desta tela
              </p>
              <p className="mt-1 text-xs text-ink-700/70">
                Elas não ficam guardadas e não podem ser consultadas depois. Cada funcionário
                precisará trocá-la no primeiro acesso.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-700/60">
                      <th className="pb-2 pr-3 font-medium">Matrícula</th>
                      <th className="pb-2 pr-3 font-medium">Nome</th>
                      <th className="pb-2 pr-3 font-medium">Usuário (login)</th>
                      <th className="pb-2 font-medium">Senha provisória</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {resultado.resumo.criados.map((pessoa) => (
                      <tr key={pessoa.username}>
                        <td className="py-2 pr-3 text-ink-700">{pessoa.matricula}</td>
                        <td className="py-2 pr-3 text-ink-900">{pessoa.nome}</td>
                        <td className="py-2 pr-3 font-mono text-ink-700">{pessoa.username}</td>
                        <td className="py-2 font-mono text-ink-900">{pessoa.senhaProvisoria}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {resultado.resumo.ignorados.length > 0 && (
            <Alert tone="warning">
              <p className="font-medium">Ignorados nesta sincronização:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {resultado.resumo.ignorados.map((item) => (
                  <li key={item.nome}>
                    {item.nome} — {item.motivo}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      )}
    </section>
  );
}
