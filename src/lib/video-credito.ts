/**
 * Regra de crédito de tempo assistido de vídeo.
 *
 * Vive separada da server action que a usa por dois motivos: é a regra que
 * impede um funcionário de forjar a própria conclusão, e é a única parte do
 * sistema onde o resultado depende do relógio. Como função pura, recebe o
 * "agora" por parâmetro e pode ser exercitada em teste com o tempo controlado,
 * sem esperar minutos reais.
 */

/** Folga para reprodução acelerada (até 2x) e atraso de rede. */
export const TOLERANCIA_VELOCIDADE = 2;
/** Teto por heartbeat: impede que uma aba esquecida acumule tudo de uma vez. */
export const CREDITO_MAXIMO_POR_HEARTBEAT = 30;
/** Crédito do primeiro heartbeat, quando ainda não há intervalo a medir. */
export const CREDITO_PRIMEIRO_HEARTBEAT = 5;
/** Exigência quando a duração do vídeo não pôde ser lida (WebM, OGG). */
export const SEGUNDOS_EXIGIDOS_SEM_DURACAO = 60;

export interface EstadoAnterior {
  posicaoSegundos: number;
  percentual: number;
  segundosAssistidos: number;
  concluida: boolean;
  atualizadoEm: Date;
}

export interface EntradaCredito {
  /** Momento da requisição. Injetado para o teste poder controlar o relógio. */
  agora: Date;
  /** O que já estava gravado, ou null no primeiro heartbeat da aula. */
  anterior: EstadoAnterior | null;
  /** Posição do ponteiro informada pelo navegador, já sanitizada. */
  posicaoSegundos: number;
  /** Percentual proposto pelo navegador, já limitado a 0–100. */
  percentualProposto: number;
  /** Duração real do vídeo, lida do arquivo. Zero quando desconhecida. */
  duracaoSegundos: number;
  /** Percentual que conclui a aula, vindo do curso no banco. */
  limiarPercentual: number;
}

export interface ResultadoCredito {
  segundosAssistidos: number;
  percentual: number;
  concluir: boolean;
}

/**
 * Calcula quanto tempo assistido creditar e se a aula termina.
 *
 * O crédito é o MENOR entre dois limites independentes:
 *
 *  - o relógio do servidor desde o heartbeat anterior, com folga de 2x, que
 *    impede acumular mais rápido do que o vídeo dura; e
 *  - o avanço real do ponteiro, que impede ganhar tempo com a página aberta
 *    e parada.
 *
 * Arrastar a barra até o fim falha no primeiro limite; deixar a aba aberta
 * falha no segundo. Assistir de verdade satisfaz os dois.
 *
 * Concluir exige as duas coisas: o navegador afirmar que chegou ao limiar E o
 * tempo creditado cobrir a fração exigida da duração. A primeira condição
 * sozinha seria a palavra do cliente; a segunda sozinha deixaria concluir uma
 * aula sem nunca chegar ao fim dela.
 */
export function calcularCredito(entrada: EntradaCredito): ResultadoCredito {
  const { agora, anterior, posicaoSegundos, percentualProposto, duracaoSegundos, limiarPercentual } =
    entrada;

  const decorridoSegundos = anterior
    ? (agora.getTime() - anterior.atualizadoEm.getTime()) / 1000
    : CREDITO_PRIMEIRO_HEARTBEAT;

  const avancoDoPonteiro = posicaoSegundos - (anterior?.posicaoSegundos ?? 0);

  const credito = Math.max(
    0,
    Math.min(
      decorridoSegundos * TOLERANCIA_VELOCIDADE,
      avancoDoPonteiro,
      CREDITO_MAXIMO_POR_HEARTBEAT
    )
  );

  const segundosAssistidos = (anterior?.segundosAssistidos ?? 0) + credito;

  const exigidos =
    duracaoSegundos > 0
      ? (duracaoSegundos * limiarPercentual) / 100
      : SEGUNDOS_EXIGIDOS_SEM_DURACAO;

  // O percentual exibido também é limitado pelo tempo efetivamente assistido.
  const percentualPorTempo =
    duracaoSegundos > 0 ? (segundosAssistidos / duracaoSegundos) * 100 : percentualProposto;

  const percentual = Math.min(
    100,
    Math.max(
      anterior?.percentual ?? 0,
      Math.min(percentualProposto, Math.round(percentualPorTempo))
    )
  );

  const jaConcluida = anterior?.concluida ?? false;
  const concluir =
    jaConcluida || (percentualProposto >= limiarPercentual && segundosAssistidos >= exigidos);

  return { segundosAssistidos, percentual, concluir };
}
