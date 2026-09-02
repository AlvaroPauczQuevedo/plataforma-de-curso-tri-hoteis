/**
 * Teto de acontecimentos por janela de tempo.
 *
 * Existe por causa da rota `/api/erros`, que recebe do navegador o aviso de
 * que uma tela quebrou. Ela não tem autenticação de propósito — a tela pode
 * ter quebrado justamente no caminho da sessão —, e cada aviso vira uma linha
 * no registro de erros, que é arquivo e não tem limite próprio. Sem teto, um
 * laço de requisições enche o disco do servidor.
 *
 * A contagem é pura e recebe o "agora" por parâmetro, como a regra de crédito
 * de vídeo: é a única parte cujo resultado depende do relógio, e assim dá para
 * exercitar a virada da janela em teste sem esperar um minuto real.
 *
 * A janela é FIXA, não deslizante: ao estourar a duração, o contador zera de
 * uma vez. É menos preciso que uma janela deslizante e é o suficiente aqui —
 * o objetivo não é ser justo entre visitantes, é não deixar o disco encher.
 */

export type Janela = {
  /** Quando a janela atual começou, em milissegundos. */
  comecouEm: number;
  /** Quantos acontecimentos ela já contou. */
  recebidos: number;
};

/** Estado inicial: nenhuma janela aberta ainda. */
export const JANELA_NOVA: Janela = { comecouEm: 0, recebidos: 0 };

export type Vaga = {
  /** A janela depois de contar este acontecimento. */
  janela: Janela;
  /** Falso quando o teto já havia sido atingido. */
  aceito: boolean;
};

/**
 * Conta um acontecimento e diz se ele cabe no teto.
 *
 * O que passa do teto ainda é CONTADO, e de propósito: enquanto a enxurrada
 * continuar, a janela não deve reabrir por ter parado de contar.
 */
export function consumirVaga(
  janela: Janela,
  agora: number,
  teto: number,
  duracaoMs: number
): Vaga {
  const expirou = agora - janela.comecouEm > duracaoMs;
  const base = expirou ? { comecouEm: agora, recebidos: 0 } : janela;

  const recebidos = base.recebidos + 1;

  return {
    janela: { comecouEm: base.comecouEm, recebidos },
    aceito: recebidos <= teto,
  };
}
