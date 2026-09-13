import { Sheet } from "lucide-react";

/**
 * O botão que baixa a planilha.
 *
 * Âncora, e não botão com `onClick`: é um GET que devolve arquivo, então o
 * navegador resolve sozinho — sem JavaScript, sem estado de carregando, e o
 * usuário pode abrir em outra aba ou copiar o endereço. Um `fetch` seguido de
 * `URL.createObjectURL` faria o mesmo com três coisas a mais para quebrar.
 *
 * Por isso também é um componente de servidor: não há interação nenhuma aqui.
 */
export function BotaoCsv({
  fonte,
  filtros,
  rotulo = "Exportar CSV",
  titulo,
}: {
  fonte: "conformidade" | "usuarios" | "documentos";
  /**
   * Os filtros da tela, repassados como estão.
   *
   * Quem filtrou a Recepção do Canela e clica em exportar espera o arquivo
   * daquela equipe. Baixar a rede inteira ali seria uma surpresa cara: o
   * arquivo abre, parece certo, e vai para o e-mail errado.
   */
  filtros?: Record<string, string | undefined>;
  rotulo?: string;
  titulo?: string;
}) {
  const params = new URLSearchParams({ fonte });
  for (const [chave, valor] of Object.entries(filtros ?? {})) {
    if (valor) params.set(chave, valor);
  }

  return (
    <a
      href={`/api/relatorios/csv?${params.toString()}`}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-ink-900 transition hover:bg-surface-muted"
      title={
        titulo ??
        "Baixa o que está em tela como planilha, já com o filtro aplicado. Abre no Excel com dois cliques."
      }
    >
      <Sheet className="h-4 w-4" />
      {rotulo}
    </a>
  );
}
