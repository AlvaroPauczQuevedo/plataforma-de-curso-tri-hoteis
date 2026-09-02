/**
 * O trecho de arquivo que o cliente pediu, contido dentro do arquivo real.
 *
 * O cabeçalho `Range` é escrito por quem chama, e ia direto para o
 * `createReadStream`: um pedido além do fim do arquivo produzia um 206 com
 * `Content-Length` negativo e corpo vazio — resposta que nenhum player sabe
 * interpretar, e que o navegador trata como vídeo corrompido.
 *
 * A regra mora aqui, pura, porque é aritmética de borda: o último byte, o
 * arquivo vazio, o pedido sem fim declarado, o pedido maior do que resta. É
 * exatamente o tipo de conta que se erra em silêncio, e separada da rota dá
 * para exercitá-la sem subir servidor nem gravar arquivo.
 *
 * As pontas são INCLUSIVAS, como manda o HTTP: `bytes=0-0` é um byte, não zero.
 */

export type PedidoDeFaixa =
  /** Sem `Range` utilizável: serve o arquivo inteiro, com 200. */
  | { tipo: "arquivo-inteiro" }
  /** Trecho válido. Responde 206 com `Content-Range`. */
  | { tipo: "trecho"; inicio: number; fim: number }
  /** O pedido não alcança nenhum byte do arquivo. Responde 416. */
  | { tipo: "fora-do-arquivo" };

const FORMATO = /bytes=(\d+)-(\d*)/;

export function faixaPedida(cabecalho: string | null, tamanho: number): PedidoDeFaixa {
  if (!cabecalho) return { tipo: "arquivo-inteiro" };

  const partes = FORMATO.exec(cabecalho);
  /*
    Formato que não reconhecemos — inclusive as formas legítimas que a rota
    nunca tratou, como `bytes=-500`. Servir o arquivo inteiro é a resposta
    conservadora, e é o que a rota já fazia antes: o cliente recebe tudo e se
    vira, em vez de receber uma recusa por algo que ele pediu direito.
  */
  if (!partes) return { tipo: "arquivo-inteiro" };

  // Arquivo vazio não tem byte nenhum para entregar em trecho.
  if (tamanho <= 0) return { tipo: "fora-do-arquivo" };

  const inicio = Number.parseInt(partes[1]!, 10);
  // Sem fim declarado ("bytes=500-"), vai até o último byte.
  const fimPedido = partes[2] ? Number.parseInt(partes[2], 10) : tamanho - 1;

  if (Number.isNaN(inicio) || Number.isNaN(fimPedido)) {
    return { tipo: "arquivo-inteiro" };
  }

  // Começar depois do fim do arquivo é o único pedido que não dá para atender.
  if (inicio >= tamanho) return { tipo: "fora-do-arquivo" };

  /*
    Pedir além do fim NÃO é erro: o player costuma pedir um bloco de tamanho
    fixo e o último bloco do arquivo é sempre menor. O fim é aparado no último
    byte e a resposta segue normal.
  */
  const fim = Math.min(fimPedido, tamanho - 1);
  if (fim < inicio) return { tipo: "fora-do-arquivo" };

  return { tipo: "trecho", inicio, fim };
}
