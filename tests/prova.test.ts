import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calcularNota,
  corrigir,
  motivoParaNaoPublicar,
  type QuestaoCorrigivel,
  estatisticasDaProva,
  comoMostrarAoAluno,
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

describe("Estatística da prova", () => {
  const questao = (id: string, acertou: boolean) => ({
    questaoId: id,
    enunciado: `Questão ${id}`,
    alternativaMarcada: "x",
    alternativaCorreta: "y",
    acertou,
  });

  const tentativa = (
    userId: string,
    nome: string,
    nota: number,
    aprovado: boolean,
    quando: string,
    questoes: ReturnType<typeof questao>[]
  ) => ({ userId, nome, nota, aprovado, quando: new Date(quando), questoes });

  it("vale a melhor nota da pessoa, não a primeira", () => {
    const e = estatisticasDaProva([
      tentativa("u1", "Ana", 50, false, "2026-01-01", [questao("q1", false)]),
      tentativa("u1", "Ana", 100, true, "2026-01-02", [questao("q1", true)]),
    ]);

    assert.equal(e.pessoas.length, 1, "duas tentativas, uma pessoa");
    assert.equal(e.pessoas[0]!.tentativas, 2);
    assert.equal(e.pessoas[0]!.melhorNota, 100);
    assert.equal(e.pessoas[0]!.aprovado, true, "aprovar depois vale como aprovado");
  });

  it("reprovar depois de aprovar não desfaz a aprovação", () => {
    const e = estatisticasDaProva([
      tentativa("u1", "Ana", 100, true, "2026-01-01", [questao("q1", true)]),
      tentativa("u1", "Ana", 0, false, "2026-01-02", [questao("q1", false)]),
    ]);

    assert.equal(e.pessoas[0]!.aprovado, true);
    assert.equal(e.pessoas[0]!.melhorNota, 100);
  });

  it("a questão mais errada aparece primeiro", () => {
    const e = estatisticasDaProva([
      tentativa("u1", "Ana", 50, false, "2026-01-01", [
        questao("facil", true),
        questao("dificil", false),
      ]),
      tentativa("u2", "Bruno", 50, false, "2026-01-01", [
        questao("facil", true),
        questao("dificil", false),
      ]),
    ]);

    assert.equal(e.questoes[0]!.questaoId, "dificil");
    assert.equal(e.questoes[0]!.percentualDeErro, 100);
    assert.equal(e.questoes[1]!.percentualDeErro, 0);
  });

  it("a questão conta todas as tentativas, não só a melhor", () => {
    const e = estatisticasDaProva([
      tentativa("u1", "Ana", 0, false, "2026-01-01", [questao("q1", false)]),
      tentativa("u1", "Ana", 100, true, "2026-01-02", [questao("q1", true)]),
    ]);

    assert.equal(e.questoes[0]!.respostas, 2, "as duas passagens contam");
    assert.equal(e.questoes[0]!.erros, 1);
    assert.equal(e.questoes[0]!.percentualDeErro, 50);
  });

  it("taxa de aprovação conta gente, não tentativa", () => {
    const e = estatisticasDaProva([
      tentativa("u1", "Ana", 100, true, "2026-01-01", [questao("q1", true)]),
      tentativa("u1", "Ana", 100, true, "2026-01-02", [questao("q1", true)]),
      tentativa("u2", "Bruno", 0, false, "2026-01-01", [questao("q1", false)]),
    ]);

    assert.equal(e.taxaDeAprovacao, 50, "uma de duas pessoas, apesar de 3 tentativas");
    assert.equal(e.mediaDasMelhores, 50);
  });

  it("prova sem tentativa não divide por zero", () => {
    const e = estatisticasDaProva([]);
    assert.equal(e.taxaDeAprovacao, 0);
    assert.equal(e.mediaDasMelhores, 0);
    assert.deepEqual(e.pessoas, []);
  });
});

describe("O que o aluno vê na revisão", () => {
  const questoes = [
    {
      id: "q1",
      enunciado: "Primeira",
      alternativas: [
        { id: "a", correta: true },
        { id: "b", correta: false },
      ],
    },
    {
      id: "q2",
      enunciado: "Segunda",
      alternativas: [
        { id: "c", correta: true },
        { id: "d", correta: false },
      ],
    },
  ];

  it("reprovado não recebe o gabarito", () => {
    const bruto = corrigir(questoes, { q1: "b", q2: "d" }, 70);
    const mostrado = comoMostrarAoAluno(bruto);

    assert.equal(mostrado.aprovado, false);
    assert.deepEqual(
      mostrado.questoes.map((q) => q.alternativaCorreta),
      [null, null],
      "o gabarito não pode sair do servidor para quem reprovou"
    );
  });

  it("reprovado ainda vê o que errou e o que marcou", () => {
    const mostrado = comoMostrarAoAluno(corrigir(questoes, { q1: "a", q2: "d" }, 70));

    assert.equal(mostrado.questoes[0]!.acertou, true);
    assert.equal(mostrado.questoes[1]!.acertou, false);
    assert.equal(mostrado.questoes[1]!.alternativaMarcada, "d");
    assert.equal(mostrado.nota, 50, "a nota continua a mesma");
  });

  it("aprovado vê o gabarito completo", () => {
    const mostrado = comoMostrarAoAluno(corrigir(questoes, { q1: "a", q2: "c" }, 70));

    assert.equal(mostrado.aprovado, true);
    assert.deepEqual(
      mostrado.questoes.map((q) => q.alternativaCorreta),
      ["a", "c"]
    );
  });

  it("o resultado gravado continua completo", () => {
    const bruto = corrigir(questoes, { q1: "b", q2: "d" }, 70);
    comoMostrarAoAluno(bruto);

    assert.deepEqual(
      bruto.questoes.map((q) => q.alternativaCorreta),
      ["a", "c"],
      "ocultar para a tela não pode mutilar o registro nem a estatística"
    );
  });
});
