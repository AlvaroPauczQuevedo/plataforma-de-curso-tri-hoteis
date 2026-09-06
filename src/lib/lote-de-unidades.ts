/**
 * Leitura do texto colado no cadastro de hotéis em lote.
 *
 * Módulo próprio, sem banco nem sessão, porque é aqui que mora a regra — o que
 * conta como nome, o que conta como repetido — e regra sem teste é regra que
 * muda sozinha. A action em `actions/unidades.ts` fica só com a parte que
 * depende do banco: quais desses já existem.
 */

/**
 * Quantos nomes um envio aceita de uma vez.
 *
 * A rede tem 25 hotéis. O teto existe para o engano de colagem — a planilha
 * inteira no lugar da coluna — parar com uma frase clara, em vez de virar
 * centenas de unidades que alguém teria de apagar uma a uma.
 */
export const MAXIMO_DO_LOTE = 200;

/**
 * Um nome por linha, na ordem em que foram colados.
 *
 * Linha vazia é descartada: colagem de planilha vem cheia delas, e cada uma
 * viraria um erro de "informe o nome" no meio de um lote bom.
 *
 * Repetido DENTRO do próprio texto sai fora. O índice único do banco diferencia
 * maiúsculas de minúsculas, então sem isto "Tri Hotel Canela" e "Tri hotel
 * canela" entrariam as duas e a rede passaria a ter dois hotéis para a mesma
 * casa — o tipo de erro que só aparece meses depois, quando um relatório não
 * fecha.
 *
 * A primeira grafia é a que fica, porque é a que a pessoa escreveu primeiro.
 */
export function nomesDoLote(texto: string): string[] {
  const vistos = new Set<string>();
  const nomes: string[] = [];

  for (const linha of (texto ?? "").split(/\r?\n/)) {
    const nome = linha.trim();
    if (!nome) continue;

    const chave = chaveDeComparacao(nome);
    if (vistos.has(chave)) continue;

    vistos.add(chave);
    nomes.push(nome);
  }

  return nomes;
}

/**
 * A forma usada só para COMPARAR — nunca para gravar.
 *
 * Além de ignorar maiúsculas, ignora acento e espaço repetido: numa lista
 * digitada à mão, "Tri Hotel Antônio Prado" e "Tri Hotel Antonio Prado" são a
 * mesma casa, e cadastrar as duas é pior do que recusar uma.
 *
 * `\p{Diacritic}` em vez da faixa de combinantes escrita à mão: a faixa exige
 * digitar caracteres invisíveis no código-fonte, que somem em qualquer
 * ferramenta que normalize texto no caminho. Já aconteceu neste projeto.
 */
export function chaveDeComparacao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}
