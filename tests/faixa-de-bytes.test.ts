import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { faixaPedida } from "../src/lib/faixa-de-bytes";

/**
 * O trecho de arquivo pedido pelo cliente.
 *
 * Este módulo não toca banco nem disco: entra um cabeçalho e o tamanho do
 * arquivo, sai a faixa contida nele. É aritmética de borda, que é onde mora o
 * erro silencioso — e o defeito que ele conserta era exatamente isso: um
 * pedido além do fim virava 206 com Content-Length negativo.
 */

/** Um arquivo de 1000 bytes: índices válidos vão de 0 a 999. */
const TAMANHO = 1000;

describe("Pedido sem faixa", () => {
  it("sem cabeçalho, serve o arquivo inteiro", () => {
    assert.deepEqual(faixaPedida(null, TAMANHO), { tipo: "arquivo-inteiro" });
  });

  it("cabeçalho em formato desconhecido serve o arquivo inteiro", () => {
    // Conservador de propósito: o cliente recebe tudo em vez de uma recusa.
    assert.deepEqual(faixaPedida("bytes=-500", TAMANHO), { tipo: "arquivo-inteiro" });
    assert.deepEqual(faixaPedida("laranjas=0-10", TAMANHO), { tipo: "arquivo-inteiro" });
    assert.deepEqual(faixaPedida("", TAMANHO), { tipo: "arquivo-inteiro" });
  });
});

describe("Faixas válidas", () => {
  it("um trecho no meio do arquivo", () => {
    assert.deepEqual(faixaPedida("bytes=100-199", TAMANHO), {
      tipo: "trecho",
      inicio: 100,
      fim: 199,
    });
  });

  it("sem fim declarado, vai até o último byte", () => {
    assert.deepEqual(faixaPedida("bytes=500-", TAMANHO), {
      tipo: "trecho",
      inicio: 500,
      fim: 999,
    });
  });

  it("as pontas são inclusivas: um byte é um byte", () => {
    assert.deepEqual(faixaPedida("bytes=0-0", TAMANHO), {
      tipo: "trecho",
      inicio: 0,
      fim: 0,
    });
  });

  it("o último byte do arquivo é alcançável", () => {
    assert.deepEqual(faixaPedida("bytes=999-999", TAMANHO), {
      tipo: "trecho",
      inicio: 999,
      fim: 999,
    });
  });

  it("pedir além do fim não é erro: apara no último byte", () => {
    /*
      O player pede blocos de tamanho fixo, e o último bloco do arquivo é
      sempre menor do que o pedido. Recusar isso quebraria a reprodução normal.
    */
    assert.deepEqual(faixaPedida("bytes=900-999999", TAMANHO), {
      tipo: "trecho",
      inicio: 900,
      fim: 999,
    });
  });
});

describe("Faixas que não dá para atender", () => {
  it("começar depois do fim do arquivo devolve fora-do-arquivo", () => {
    // Era o caso que produzia 206 com Content-Length negativo.
    assert.deepEqual(faixaPedida("bytes=1000-1100", TAMANHO), {
      tipo: "fora-do-arquivo",
    });
    assert.deepEqual(faixaPedida("bytes=999999-", TAMANHO), {
      tipo: "fora-do-arquivo",
    });
  });

  it("arquivo vazio não entrega trecho nenhum", () => {
    assert.deepEqual(faixaPedida("bytes=0-10", 0), { tipo: "fora-do-arquivo" });
    assert.deepEqual(faixaPedida("bytes=0-", 0), { tipo: "fora-do-arquivo" });
  });

  it("fim antes do início devolve fora-do-arquivo", () => {
    assert.deepEqual(faixaPedida("bytes=500-100", TAMANHO), {
      tipo: "fora-do-arquivo",
    });
  });
});

describe("O tamanho devolvido nunca é negativo", () => {
  it("qualquer faixa aceita tem ao menos um byte", () => {
    /*
      A garantia que o defeito violava. O Content-Length da rota é
      fim - inicio + 1, então uma faixa com fim < inicio virava número
      negativo no cabeçalho.
    */
    const cabecalhos = [
      "bytes=0-0",
      "bytes=0-999",
      "bytes=999-999",
      "bytes=500-",
      "bytes=900-999999",
      "bytes=0-1",
    ];

    for (const cabecalho of cabecalhos) {
      const faixa = faixaPedida(cabecalho, TAMANHO);
      assert.equal(faixa.tipo, "trecho", cabecalho);

      if (faixa.tipo !== "trecho") continue;
      const tamanho = faixa.fim - faixa.inicio + 1;

      assert.ok(tamanho >= 1, `${cabecalho} deu tamanho ${tamanho}`);
      assert.ok(faixa.inicio >= 0, `${cabecalho} começou em ${faixa.inicio}`);
      assert.ok(faixa.fim < TAMANHO, `${cabecalho} terminou em ${faixa.fim}`);
    }
  });
});
