import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calcularNota,
  corrigir,
  motivoParaNaoPublicar,
  type QuestaoCorrigivel,
} from "../src/lib/prova";

/** Questão de três alternativas, com a primeira correta por padrão. */
function questao(id: string, corretaEm = 0): QuestaoCorrigivel {
  return {
    id,
    enunciado: `Enunciado ${id}`,
    alternativas: [
      { id: `${id}-a`, correta: corretaEm === 0 },
      { id: `${id}-b`, correta: corretaEm === 1 },
      { id: `${id}-c`, correta: corretaEm === 2 },
    ],
  };
}

describe("Nota da prova", () => {
  it("é o percentual arredondado de acerto", () => {
    assert.equal(calcularNota(3, 4), 75);
    assert.equal(calcularNota(2, 3), 67);
    assert.equal(calcularNota(1, 3), 33);
    assert.equal(calcularNota(4, 4), 100);
    assert.equal(calcularNota(0, 5), 0);
  });

  it("prova sem questão devolve zero em vez de dividir por zero", () => {
    assert.equal(calcularNota(0, 0), 0);
  });
});

describe("Correção", () => {
  it("conta acertos e reprova abaixo da nota mínima", () => {
    const questoes = [questao("q1"), questao("q2"), questao("q3"), questao("q4")];
    const resultado = corrigir(
      questoes,
      { q1: "q1-a", q2: "q2-a", q3: "q3-b", q4: "q4-c" },
      70
    );

    assert.equal(resultado.acertos, 2);
    assert.equal(resultado.total, 4);
    assert.equal(resultado.nota, 50);
    assert.equal(resultado.aprovado, false);
  });

  it("aprova quando a nota alcança exatamente o mínimo", () => {
    const questoes = [questao("q1"), questao("q2"), questao("q3"), questao("q4")];
    const resultado = corrigir(
      questoes,
      { q1: "q1-a", q2: "q2-a", q3: "q3-a", q4: "q4-b" },
      75
    );

    assert.equal(resultado.nota, 75);
    assert.equal(resultado.aprovado, true);
  });

  it("questão em branco conta como erro", () => {
    const resultado = corrigir([questao("q1"), questao("q2")], { q1: "q1-a" }, 50);

    assert.equal(resultado.acertos, 1);
    assert.equal(resultado.questoes[1].alternativaMarcada, null);
    assert.equal(resultado.questoes[1].acertou, false);
  });

  it("questão sem gabarito conta como erro, não como acerto grátis", () => {
    const semGabarito: QuestaoCorrigivel = {
      id: "q1",
      enunciado: "Sem alternativa correta",
      alternativas: [
        { id: "q1-a", correta: false },
        { id: "q1-b", correta: false },
      ],
    };

    const resultado = corrigir([semGabarito], { q1: "q1-a" }, 50);

    assert.equal(resultado.acertos, 0);
    assert.equal(resultado.aprovado, false);
    assert.equal(resultado.questoes[0].alternativaCorreta, null);
  });

  it("registra o que foi marcado e o que era correto, para revisão", () => {
    const resultado = corrigir([questao("q1", 1)], { q1: "q1-c" }, 50);

    assert.equal(resultado.questoes[0].alternativaMarcada, "q1-c");
    assert.equal(resultado.questoes[0].alternativaCorreta, "q1-b");
    assert.equal(resultado.questoes[0].acertou, false);
  });

  it("prova vazia nunca aprova", () => {
    const resultado = corrigir([], {}, 0);

    assert.equal(resultado.nota, 0);
    assert.equal(resultado.aprovado, false);
  });
});

describe("Publicação de prova", () => {
  it("recusa prova sem questão", () => {
    assert.match(String(motivoParaNaoPublicar([])), /ao menos uma questão/);
  });

  it("recusa questão sem alternativa correta", () => {
    const semGabarito: QuestaoCorrigivel = {
      id: "q1",
      enunciado: "?",
      alternativas: [
        { id: "a", correta: false },
        { id: "b", correta: false },
      ],
    };

    assert.match(String(motivoParaNaoPublicar([semGabarito])), /alternativa correta/);
  });

  it("recusa questão com menos de duas alternativas", () => {
    const unica: QuestaoCorrigivel = {
      id: "q1",
      enunciado: "?",
      alternativas: [{ id: "a", correta: true }],
    };

    assert.match(String(motivoParaNaoPublicar([unica])), /duas alternativas/);
  });

  it("aceita prova completa", () => {
    assert.equal(motivoParaNaoPublicar([questao("q1"), questao("q2")]), null);
  });
});
