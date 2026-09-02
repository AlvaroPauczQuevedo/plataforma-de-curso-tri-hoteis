import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consumirVaga, JANELA_NOVA, type Janela } from "../src/lib/teto-de-avisos";

/**
 * O teto de avisos da rota /api/erros.
 *
 * Ela não tem autenticação de propósito — a tela pode ter quebrado justamente
 * no caminho da sessão — e cada aviso vira uma linha num arquivo, que não tem
 * limite próprio. O teto é o que impede um laço de requisições encher o disco.
 *
 * Como a regra recebe o relógio por parâmetro, dá para atravessar a virada da
 * janela aqui sem esperar um minuto real.
 */

const TETO = 5;
const JANELA_MS = 60_000;

/** Dispara `quantos` avisos no mesmo instante e devolve quantos foram aceitos. */
function disparar(janela: Janela, agora: number, quantos: number) {
  let aceitos = 0;
  let atual = janela;

  for (let i = 0; i < quantos; i += 1) {
    const vaga = consumirVaga(atual, agora, TETO, JANELA_MS);
    atual = vaga.janela;
    if (vaga.aceito) aceitos += 1;
  }

  return { janela: atual, aceitos };
}

describe("Dentro do teto", () => {
  it("aceita até o limite e recusa a partir dele", () => {
    const { aceitos } = disparar(JANELA_NOVA, 1_000_000, TETO + 10);

    assert.equal(aceitos, TETO);
  });

  it("o primeiro aviso sempre passa", () => {
    const vaga = consumirVaga(JANELA_NOVA, 1_000_000, TETO, JANELA_MS);

    assert.equal(vaga.aceito, true);
    assert.equal(vaga.janela.recebidos, 1);
  });

  it("um teto de zero recusa tudo", () => {
    const vaga = consumirVaga(JANELA_NOVA, 1_000_000, 0, JANELA_MS);
    assert.equal(vaga.aceito, false);
  });
});

describe("Virada da janela", () => {
  it("passada a duração, o contador zera e volta a aceitar", () => {
    const inicio = 1_000_000;
    const cheia = disparar(JANELA_NOVA, inicio, TETO + 3);
    assert.equal(cheia.aceitos, TETO);

    // Ainda dentro da janela: continua recusando.
    const aindaDentro = consumirVaga(cheia.janela, inicio + JANELA_MS, TETO, JANELA_MS);
    assert.equal(aindaDentro.aceito, false);

    // Passou da janela: aceita de novo.
    const depois = consumirVaga(cheia.janela, inicio + JANELA_MS + 1, TETO, JANELA_MS);
    assert.equal(depois.aceito, true);
    assert.equal(depois.janela.recebidos, 1);
    assert.equal(depois.janela.comecouEm, inicio + JANELA_MS + 1);
  });

  it("uma enxurrada contínua não reabre a janela", () => {
    /*
      O que passa do teto continua sendo CONTADO. Se o excedente não contasse,
      uma enxurrada sem pausa manteria o contador baixo e a janela reabriria
      sozinha — que é justamente o caso que o teto existe para conter.
    */
    const inicio = 1_000_000;
    let janela = JANELA_NOVA;
    let aceitos = 0;

    // Mil avisos ao longo de meio minuto, todos dentro da mesma janela.
    for (let i = 0; i < 1000; i += 1) {
      const vaga = consumirVaga(janela, inicio + i * 30, TETO, JANELA_MS);
      janela = vaga.janela;
      if (vaga.aceito) aceitos += 1;
    }

    assert.equal(aceitos, TETO);
    assert.equal(janela.recebidos, 1000);
  });
});

describe("Janelas seguidas", () => {
  it("cada janela tem o próprio teto", () => {
    const inicio = 1_000_000;
    let janela = JANELA_NOVA;
    let total = 0;

    for (let volta = 0; volta < 4; volta += 1) {
      const agora = inicio + volta * (JANELA_MS + 1);
      const resultado = disparar(janela, agora, TETO + 2);
      janela = resultado.janela;
      total += resultado.aceitos;
    }

    assert.equal(total, TETO * 4);
  });
});
