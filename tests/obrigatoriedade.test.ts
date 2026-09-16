import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  motivoDePrazoInvalido,
  motivoDeValidadeInvalida,
  resumoDoLote,
  separarObrigatoriedades,
} from "../src/lib/obrigatoriedade";

/**
 * A obrigatoriedade em lote.
 *
 * Existe porque nesta rede o departamento é o hotel: marcar "Brigada de
 * incêndio" para as 25 casas eram 25 idas ao formulário, e bastava esquecer
 * uma para o hotel ficar irregular sem ninguém notar — a Conformidade o mostra
 * em dia, porque ele não deve nada.
 */

describe("Validação de prazo e validade", () => {
  it("nulo é válido: é 'sem prazo' e 'não vence'", () => {
    assert.equal(motivoDePrazoInvalido(null), null);
    assert.equal(motivoDeValidadeInvalida(null), null);
  });

  it("zero e negativo são recusados", () => {
    // Zero venceria hoje, o que não é o que ninguém quis dizer.
    assert.ok(motivoDePrazoInvalido(0));
    assert.ok(motivoDePrazoInvalido(-5));
    assert.ok(motivoDeValidadeInvalida(0));
  });

  it("fracionário é recusado", () => {
    assert.ok(motivoDePrazoInvalido(1.5));
    assert.ok(motivoDeValidadeInvalida(11.9));
  });

  it("valores normais passam", () => {
    assert.equal(motivoDePrazoInvalido(30), null);
    assert.equal(motivoDeValidadeInvalida(12), null);
  });
});

describe("Separação do lote", () => {
  it("tudo novo quando nada existia", () => {
    const r = separarObrigatoriedades(["a", "b", "c"], new Set());

    assert.deepEqual(r.novos, ["a", "b", "c"]);
    assert.deepEqual(r.jaEram, []);
  });

  it("setor que já era obrigatório é PULADO, não recusado", () => {
    /*
      É pedido já atendido, não erro. Recusar o lote por causa dele obrigaria
      a pessoa a descobrir quais setores já têm e desmarcá-los um a um — o
      trabalho manual que o lote existe para tirar.
    */
    const r = separarObrigatoriedades(["a", "b", "c"], new Set(["b"]));

    assert.deepEqual(r.novos, ["a", "c"]);
    assert.deepEqual(r.jaEram, ["b"]);
  });

  it("marcar duas vezes é marcar uma", () => {
    const r = separarObrigatoriedades(["a", "a", "b"], new Set());
    assert.deepEqual(r.novos, ["a", "b"]);
  });

  it("descarta id vazio em vez de gravar registro órfão", () => {
    assert.deepEqual(separarObrigatoriedades(["", "a"], new Set()).novos, ["a"]);
  });

  it("todos já obrigatórios: nada novo, e nenhum erro", () => {
    const r = separarObrigatoriedades(["a", "b"], new Set(["a", "b"]));

    assert.deepEqual(r.novos, []);
    assert.deepEqual(r.jaEram, ["a", "b"]);
  });

  it("preserva a ordem em que os setores foram marcados", () => {
    assert.deepEqual(separarObrigatoriedades(["c", "a", "b"], new Set()).novos, ["c", "a", "b"]);
  });
});

describe("Resumo mostrado depois do lote", () => {
  it("conta setores e matrículas", () => {
    const texto = resumoDoLote({ novos: 25, jaEram: 0, matriculas: 180 });

    assert.match(texto, /25 setores/);
    assert.match(texto, /180 funcionários matriculados/);
  });

  it("usa o singular quando é um só", () => {
    // Errar o plural num aviso sobre matrícula obrigatória deixa quem lê em
    // dúvida sobre o que foi feito.
    const texto = resumoDoLote({ novos: 1, jaEram: 1, matriculas: 1 });

    assert.match(texto, /1 setor\./);
    assert.match(texto, /1 já era e foi mantido/);
    assert.match(texto, /1 funcionário matriculado/);
  });

  it("diz quando nenhum setor era novo", () => {
    const texto = resumoDoLote({ novos: 0, jaEram: 3, matriculas: 0 });

    assert.match(texto, /Nenhum setor novo/);
    assert.match(texto, /3 já eram/);
  });

  it("avisa quando ninguém precisou ser matriculado", () => {
    const texto = resumoDoLote({ novos: 2, jaEram: 0, matriculas: 0 });
    assert.match(texto, /Todos já estavam matriculados/);
  });
});
