import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapaDeLiberacaoDaTrilha,
  progressoDaTrilha,
  renumerarDegraus,
  type DegrauParaLiberacao,
} from "../src/lib/trilhas";

/**
 * A ordem da trilha. Nada aqui toca o banco: entram os degraus e o que a
 * pessoa já concluiu.
 *
 * O que estes testes protegem é o caso que estraga o módulo inteiro — trancar
 * um curso que a pessoa JÁ FEZ. Ela seria mandada refazer treinamento, e a
 * trilha passaria a discordar da Conformidade sobre a mesma pessoa.
 */

const degraus = (...ids: string[]): DegrauParaLiberacao[] =>
  ids.map((courseId, ordem) => ({ courseId, ordem }));

describe("Liberação dos degraus", () => {
  it("o primeiro degrau começa liberado", () => {
    // Uma trilha que começa trancada não tem como começar.
    const mapa = mapaDeLiberacaoDaTrilha(degraus("a", "b", "c"), new Set());

    assert.equal(mapa.get("a"), "liberado");
    assert.equal(mapa.get("b"), "trancado");
    assert.equal(mapa.get("c"), "trancado");
  });

  it("concluir um degrau libera o seguinte, e só ele", () => {
    const mapa = mapaDeLiberacaoDaTrilha(degraus("a", "b", "c"), new Set(["a"]));

    assert.equal(mapa.get("a"), "concluido");
    assert.equal(mapa.get("b"), "liberado");
    assert.equal(mapa.get("c"), "trancado");
  });

  it("todo degrau tranca o seguinte — não existe curso opcional na trilha", () => {
    /*
      Diferente de `mapaDeLiberacao`, onde aula opcional não trava o curso. Um
      degrau que pode ser pulado não é degrau: é curso avulso, e o lugar dele
      é fora da trilha.
    */
    const mapa = mapaDeLiberacaoDaTrilha(degraus("a", "b", "c", "d"), new Set(["a", "b"]));

    assert.equal(mapa.get("c"), "liberado");
    assert.equal(mapa.get("d"), "trancado");
  });

  it("curso já concluído fora de ordem CONTINUA concluído", () => {
    /*
      Acontece de verdade: a pessoa fez o curso avulso antes de a trilha
      existir, ou o RH lançou o presencial fora de ordem. Reapresentá-lo como
      trancado mandaria refazer treinamento já cumprido.
    */
    const mapa = mapaDeLiberacaoDaTrilha(degraus("a", "b", "c"), new Set(["c"]));

    assert.equal(mapa.get("a"), "liberado");
    assert.equal(mapa.get("b"), "trancado");
    assert.equal(mapa.get("c"), "concluido");
  });

  it("um buraco no meio não destranca o que vem depois", () => {
    // 'a' pendente segura 'b'; 'c' concluído continua concluído.
    const mapa = mapaDeLiberacaoDaTrilha(degraus("a", "b", "c", "d"), new Set(["c"]));

    assert.equal(mapa.get("b"), "trancado");
    assert.equal(mapa.get("d"), "trancado");
  });

  it("trilha inteira concluída não tranca nada", () => {
    const mapa = mapaDeLiberacaoDaTrilha(degraus("a", "b"), new Set(["a", "b"]));

    assert.equal(mapa.get("a"), "concluido");
    assert.equal(mapa.get("b"), "concluido");
  });

  it("trilha vazia devolve mapa vazio em vez de quebrar", () => {
    assert.equal(mapaDeLiberacaoDaTrilha([], new Set()).size, 0);
  });
});

describe("Progresso da trilha", () => {
  const comProgresso = (ids: string[], concluidos: string[]) => {
    const emOrdem = degraus(...ids);
    return progressoDaTrilha(emOrdem, mapaDeLiberacaoDaTrilha(emOrdem, new Set(concluidos)));
  };

  it("conta degraus, não percentual médio dos cursos", () => {
    /*
      "Dois de cinco" é o que a pessoa entende olhando a tela. Uma média de
      percentuais diria 46% para quem não terminou nada — meio curso feito não
      é meio treinamento cumprido.
    */
    const p = comProgresso(["a", "b", "c", "d", "e"], ["a", "b"]);

    assert.equal(p.concluidos, 2);
    assert.equal(p.total, 5);
    assert.equal(p.percent, 40);
    assert.equal(p.completa, false);
  });

  it("aponta o próximo degrau em que mexer", () => {
    assert.equal(comProgresso(["a", "b", "c"], ["a"]).proximoCursoId, "b");
  });

  it("trilha concluída não tem próximo", () => {
    const p = comProgresso(["a", "b"], ["a", "b"]);

    assert.equal(p.completa, true);
    assert.equal(p.percent, 100);
    assert.equal(p.proximoCursoId, null);
  });

  it("trilha VAZIA é 0%, não 100%", () => {
    /*
      Ela não está completa: está por montar. Mostrá-la verde esconderia
      exatamente isso de quem a criou.
    */
    const p = comProgresso([], []);

    assert.equal(p.percent, 0);
    assert.equal(p.completa, false);
  });

  it("com um buraco atrás, o próximo é o buraco", () => {
    // Fez o 'c' fora de ordem; o que falta continua sendo o 'a'.
    assert.equal(comProgresso(["a", "b", "c"], ["c"]).proximoCursoId, "a");
  });
});

describe("Reordenação dos degraus", () => {
  const atuais = [
    { id: "d1", ordem: 0 },
    { id: "d2", ordem: 1 },
    { id: "d3", ordem: 2 },
  ];

  it("renumera de 0 em diante, sem buraco", () => {
    const nova = renumerarDegraus(atuais, ["d3", "d1", "d2"]);

    assert.deepEqual(nova, [
      { id: "d3", ordem: 0 },
      { id: "d1", ordem: 1 },
      { id: "d2", ordem: 2 },
    ]);
  });

  it("degrau não mencionado vai para o fim, na ordem em que estava", () => {
    /*
      Uma tela desatualizada não pode apagar da ordem um degrau que outra
      pessoa acabou de acrescentar.
    */
    const nova = renumerarDegraus(atuais, ["d2"]);

    assert.deepEqual(nova.map((d) => d.id), ["d2", "d1", "d3"]);
    assert.deepEqual(nova.map((d) => d.ordem), [0, 1, 2]);
  });

  it("ignora id desconhecido em vez de criar degrau fantasma", () => {
    const nova = renumerarDegraus(atuais, ["d2", "inexistente", "d1"]);

    assert.equal(nova.length, 3);
    assert.ok(!nova.some((d) => d.id === "inexistente"));
  });

  it("ignora id repetido", () => {
    const nova = renumerarDegraus(atuais, ["d1", "d1", "d2"]);

    assert.deepEqual(nova.map((d) => d.id), ["d1", "d2", "d3"]);
  });

  it("lista vazia preserva a ordem atual", () => {
    assert.deepEqual(
      renumerarDegraus(atuais, []).map((d) => d.id),
      ["d1", "d2", "d3"]
    );
  });
});
