import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chaveDoLembrete,
  selecionarLembretes,
  type EstagioDeLembrete,
} from "../src/lib/lembretes";
import type { Situacao } from "../src/lib/conformidade";

/**
 * A escolha de quem recebe lembrete.
 *
 * O agendador repete — de hora em hora, se quiserem. O que impede a mesma
 * pendência de virar um aviso por dia é esta função, e é por isso que ela é
 * pura: dá para atravessar várias execuções e a virada de um prazo em teste,
 * sem relógio real e sem caixa de e-mail.
 */

const linha = (
  userId: string,
  courseId: string,
  situacao: Situacao,
  diasRestantes: number | null = 3
) => ({ userId, courseId, situacao, diasRestantes });

describe("Quem entra no lembrete", () => {
  it("avisa quem está vencendo e quem está atrasado", () => {
    const escolhidas = selecionarLembretes(
      [linha("u1", "c1", "vencendo"), linha("u2", "c1", "atrasado", -5)],
      new Set()
    );

    assert.equal(escolhidas.length, 2);
    assert.deepEqual(
      escolhidas.map((e) => e.estagio).sort(),
      ["atrasado", "vencendo"]
    );
  });

  it("não avisa quem está em dia nem quem não tem prazo", () => {
    /*
      "pendente" é obrigação sem prazo: não há data para cobrar, e cobrar
      assim mesmo encheria a caixa de gente que não deve nada ainda.
    */
    const escolhidas = selecionarLembretes(
      [linha("u1", "c1", "em_dia"), linha("u2", "c1", "pendente", null)],
      new Set()
    );

    assert.deepEqual(escolhidas, []);
  });
});

describe("O agendador repete; o aviso não", () => {
  it("o mesmo estágio não sai duas vezes", () => {
    const linhas = [linha("u1", "c1", "vencendo")];

    const primeira = selecionarLembretes(linhas, new Set());
    assert.equal(primeira.length, 1, "a primeira passagem avisa");

    const jaEnviados = new Set(
      primeira.map((e) => chaveDoLembrete(e.userId, e.courseId, e.estagio))
    );
    const segunda = selecionarLembretes(linhas, jaEnviados);

    assert.deepEqual(segunda, [], "a segunda passagem cala");
  });

  it("mas 'venceu' avisa de novo depois de 'está vencendo'", () => {
    /*
      São notícias diferentes. Quem foi avisado a sete dias do prazo precisa
      saber quando o prazo estoura — é a hora em que a pessoa fica irregular.
    */
    const jaAvisadoDeVencendo = new Set([chaveDoLembrete("u1", "c1", "vencendo")]);

    const escolhidas = selecionarLembretes(
      [linha("u1", "c1", "atrasado", -1)],
      jaAvisadoDeVencendo
    );

    assert.equal(escolhidas.length, 1);
    assert.equal(escolhidas[0].estagio, "atrasado" satisfies EstagioDeLembrete);
  });

  it("o aviso de uma pessoa não silencia o da outra", () => {
    const jaEnviados = new Set([chaveDoLembrete("u1", "c1", "vencendo")]);

    const escolhidas = selecionarLembretes(
      [linha("u1", "c1", "vencendo"), linha("u2", "c1", "vencendo")],
      jaEnviados
    );

    assert.equal(escolhidas.length, 1);
    assert.equal(escolhidas[0].userId, "u2");
  });

  it("nem o de outro curso da mesma pessoa", () => {
    const jaEnviados = new Set([chaveDoLembrete("u1", "c1", "atrasado")]);

    const escolhidas = selecionarLembretes(
      [linha("u1", "c1", "atrasado", -2), linha("u1", "c2", "atrasado", -9)],
      jaEnviados
    );

    assert.equal(escolhidas.length, 1);
    assert.equal(escolhidas[0].courseId, "c2");
  });
});

describe("A chave do lembrete", () => {
  it("separa pessoa, curso e estágio", () => {
    assert.notEqual(chaveDoLembrete("u1", "c1", "vencendo"), chaveDoLembrete("u1", "c1", "atrasado"));
    assert.notEqual(chaveDoLembrete("u1", "c1", "vencendo"), chaveDoLembrete("u2", "c1", "vencendo"));
    assert.notEqual(chaveDoLembrete("u1", "c1", "vencendo"), chaveDoLembrete("u1", "c2", "vencendo"));
  });
});
