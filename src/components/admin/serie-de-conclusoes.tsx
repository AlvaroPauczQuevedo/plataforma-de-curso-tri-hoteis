import type { MesDaSerie } from "@/lib/relatorio-gerencial";

/**
 * A evolução das conclusões, mês a mês.
 *
 * Barras em CSS puro, sem biblioteca de gráfico. Não é economia de bytes: é
 * que uma biblioteca de gráfico traz JavaScript para uma tela que hoje é
 * inteiramente de servidor, e o que ela desenharia a mais — animação, tooltip,
 * zoom — não responde nenhuma pergunta que esta série precise responder. A
 * pergunta é uma só: **está subindo ou descendo?**
 *
 * Cada barra tem duas partes, porque as duas origens contam para conformidade
 * mas dizem coisas diferentes ao gestor: o que a plataforma entregou e o que
 * foi treinado numa sala. Um mês inteiro presencial não é a plataforma
 * funcionando, e a barra empilhada mostra isso sem precisar de legenda extra.
 */
export function SerieDeConclusoes({ serie }: { serie: MesDaSerie[] }) {
  // O teto do eixo: o maior mês. Com tudo zerado usa 1, senão a divisão
  // estoura e o mês vazio ficaria com barra cheia.
  const teto = Math.max(1, ...serie.map((m) => m.total));
  const totalDoPeriodo = serie.reduce((s, m) => s + m.total, 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink-900">Conclusões por mês</h2>
        <p className="text-xs text-ink-700/60">
          {totalDoPeriodo} no período · <span className="text-brand-texto">plataforma</span> e{" "}
          <span className="text-warning-600">presencial</span>
        </p>
      </div>

      {totalDoPeriodo === 0 ? (
        <p className="mt-6 text-sm text-ink-700/60">
          Nenhuma conclusão registrada nos últimos meses.
        </p>
      ) : (
        <div className="mt-6 flex items-end gap-2 sm:gap-4">
          {serie.map((mes) => (
            <div key={mes.chave} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-medium tabular-nums text-ink-900">
                {mes.total > 0 ? mes.total : ""}
              </span>

              {/*
                Altura fixa no contêiner e proporcional nas partes: assim o mês
                de menor volume continua visível como um traço, em vez de
                sumir e parecer ausência de dado.
              */}
              <div
                className="flex h-28 w-full flex-col justify-end overflow-hidden rounded-lg bg-surface-muted"
                title={`${mes.rotulo}: ${mes.plataforma} pela plataforma, ${mes.externas} presencial`}
              >
                <div
                  className="w-full bg-warning-600"
                  style={{ height: `${(mes.externas / teto) * 100}%` }}
                />
                <div
                  className="w-full bg-brand-500"
                  style={{ height: `${(mes.plataforma / teto) * 100}%` }}
                />
              </div>

              <span className="text-xs text-ink-700/60">{mes.rotulo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
