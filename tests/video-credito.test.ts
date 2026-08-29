import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularCredito,
  type EstadoAnterior,
} from "../src/lib/video-credito";

/**
 * A regra que impede o funcionário de forjar a própria conclusão.
 *
 * Cada teste abaixo é um ataque real que já passou pelo sistema antes da
 * correção, ou o caminho honesto que precisa continuar funcionando. O relógio
 * é injetado, então o que na prática levaria minutos roda em milissegundos.
 */

const T0 = new Date("2026-01-10T10:00:00Z");
const emSegundos = (base: Date, s: number) => new Date(base.getTime() + s * 1000);

/** Estado gravado após um heartbeat honesto. */
function anterior(dados: Partial<EstadoAnterior> = {}): EstadoAnterior {
  return {
    posicaoSegundos: 0,
    percentual: 0,
    segundosAssistidos: 0,
    concluida: false,
    atualizadoEm: T0,
    ...dados,
  };
}

describe("Crédito de vídeo — tentativas de fraude", () => {
  it("arrastar a barra até o fim não conclui a aula", () => {
    // O ponteiro salta 120s, mas só 1 segundo de relógio passou.
    const r = calcularCredito({
      agora: emSegundos(T0, 1),
      anterior: anterior(),
      posicaoSegundos: 120,
      percentualProposto: 100,
      duracaoSegundos: 120,
      limiarPercentual: 90,
    });

    assert.equal(r.concluir, false);
    // O relógio limita: 1s × tolerância 2 = 2s de crédito.
    assert.equal(r.segundosAssistidos, 2);
  });

  it("repetir a chamada instantaneamente não acumula tempo", () => {
    let estado = anterior({ posicaoSegundos: 10, segundosAssistidos: 10, percentual: 8 });
    // Cem chamadas no mesmo instante, todas alegando o fim do vídeo.
    for (let i = 0; i < 100; i += 1) {
      const r = calcularCredito({
        agora: estado.atualizadoEm,
        anterior: estado,
        posicaoSegundos: 120,
        percentualProposto: 100,
        duracaoSegundos: 120,
        limiarPercentual: 90,
      });
      estado = { ...estado, segundosAssistidos: r.segundosAssistidos, percentual: r.percentual };
      assert.equal(r.concluir, false, "nenhuma das repetições pode concluir");
    }
    assert.equal(estado.segundosAssistidos, 10, "o total não cresceu");
  });

  it("aba aberta e parada não gera crédito", () => {
    // Dez minutos de relógio, mas o ponteiro não saiu do lugar.
    const r = calcularCredito({
      agora: emSegundos(T0, 600),
      anterior: anterior({ posicaoSegundos: 30, segundosAssistidos: 30, percentual: 25 }),
      posicaoSegundos: 30,
      percentualProposto: 100,
      duracaoSegundos: 120,
      limiarPercentual: 90,
    });

    assert.equal(r.segundosAssistidos, 30, "sem avanço do ponteiro, sem crédito");
    assert.equal(r.concluir, false);
  });

  it("voltar o vídeo não desconta tempo já assistido", () => {
    const r = calcularCredito({
      agora: emSegundos(T0, 10),
      anterior: anterior({ posicaoSegundos: 60, segundosAssistidos: 60, percentual: 50 }),
      posicaoSegundos: 20,
      percentualProposto: 20,
      duracaoSegundos: 120,
      limiarPercentual: 90,
    });

    assert.equal(r.segundosAssistidos, 60, "crédito nunca é negativo");
    assert.equal(r.percentual, 50, "o percentual exibido não regride");
  });

  it("uma aba esquecida em segundo plano não acumula de uma vez", () => {
    // Uma hora de relógio e o ponteiro no fim: o teto por heartbeat limita.
    const r = calcularCredito({
      agora: emSegundos(T0, 3600),
      anterior: anterior(),
      posicaoSegundos: 3600,
      percentualProposto: 100,
      duracaoSegundos: 3600,
      limiarPercentual: 90,
    });

    assert.equal(r.segundosAssistidos, 30, "teto de 30s por heartbeat");
    assert.equal(r.concluir, false);
  });

  it("sem duração conhecida, exige tempo mínimo antes de concluir", () => {
    const r = calcularCredito({
      agora: emSegundos(T0, 5),
      anterior: anterior({ posicaoSegundos: 0, segundosAssistidos: 10 }),
      posicaoSegundos: 30,
      percentualProposto: 100,
      duracaoSegundos: 0,
      limiarPercentual: 90,
    });

    assert.equal(r.concluir, false, "10s + crédito ainda está abaixo do piso de 60s");
  });
});

describe("Crédito de vídeo — reprodução honesta", () => {
  it("assistir do começo ao fim conclui a aula", () => {
    const duracao = 120;
    const limiar = 90;
    let estado: EstadoAnterior | null = null;
    let agora = T0;
    let posicao = 0;
    let concluiu = false;

    // Heartbeats a cada 4 segundos, com o ponteiro andando junto — o padrão
    // que o player produz numa reprodução normal.
    for (let i = 0; i < 40 && !concluiu; i += 1) {
      agora = emSegundos(agora, 4);
      posicao = Math.min(duracao, posicao + 4);
      const r = calcularCredito({
        agora,
        anterior: estado,
        posicaoSegundos: posicao,
        percentualProposto: Math.round((posicao / duracao) * 100),
        duracaoSegundos: duracao,
        limiarPercentual: limiar,
      });
      concluiu = r.concluir;
      estado = {
        posicaoSegundos: posicao,
        percentual: r.percentual,
        segundosAssistidos: r.segundosAssistidos,
        concluida: r.concluir,
        atualizadoEm: agora,
      };
    }

    assert.equal(concluiu, true, "quem assiste de verdade conclui");
    assert.ok(
      estado!.segundosAssistidos >= (duracao * limiar) / 100,
      "o tempo creditado cobre o limiar do curso"
    );
  });

  it("reprodução em 2x é aceita dentro da tolerância", () => {
    // 4 segundos de relógio, 8 segundos de vídeo: o dobro, no limite da folga.
    const r = calcularCredito({
      agora: emSegundos(T0, 4),
      anterior: anterior(),
      posicaoSegundos: 8,
      percentualProposto: 7,
      duracaoSegundos: 120,
      limiarPercentual: 90,
    });

    assert.equal(r.segundosAssistidos, 8, "o avanço inteiro é creditado");
  });

  it("aula já concluída continua concluída", () => {
    const r = calcularCredito({
      agora: emSegundos(T0, 1),
      anterior: anterior({ concluida: true, percentual: 100, segundosAssistidos: 120 }),
      posicaoSegundos: 0,
      percentualProposto: 0,
      duracaoSegundos: 120,
      limiarPercentual: 90,
    });

    assert.equal(r.concluir, true, "rever a aula não desfaz a conclusão");
  });

  it("o percentual exibido nunca passa de 100", () => {
    const r = calcularCredito({
      agora: emSegundos(T0, 300),
      anterior: anterior({ posicaoSegundos: 100, segundosAssistidos: 200, percentual: 99 }),
      posicaoSegundos: 120,
      percentualProposto: 100,
      duracaoSegundos: 120,
      limiarPercentual: 90,
    });

    assert.equal(r.percentual, 100);
  });
});
