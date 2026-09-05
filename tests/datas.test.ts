import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate, formatDateTime, formatPrazo } from "../src/lib/utils";

/**
 * Fuso na exibição de datas.
 *
 * O relato foi "o horário de acesso não bate". O dado estava certo no banco: a
 * exibição é que mentia. `Intl.DateTimeFormat("pt-BR")` define o FORMATO
 * (dd/mm/aaaa), não o fuso — sem a opção `timeZone` ele usa o fuso de quem
 * executa, e quem executa é o servidor. Em hospedagem Linux isso é UTC, então
 * todo horário aparecia três horas adiantado.
 *
 * Estes testes rodam em máquinas com fusos diferentes (a do desenvolvedor e a
 * do CI, que é UTC). Por isso comparam o resultado com um valor FIXO, e não com
 * outra formatação: se dependessem do relógio local, passariam aqui e
 * esconderiam a falha lá — que é exatamente como o defeito chegou à produção.
 */

/** 4 de setembro de 2026, 23h30 em UTC — 20h30 em São Paulo. Vira o dia. */
const NOITE = new Date("2026-09-04T23:30:00.000Z");

/** 5 de setembro de 2026, 01h00 em UTC — ainda dia 4, 22h, em São Paulo. */
const MADRUGADA = new Date("2026-09-05T01:00:00.000Z");

describe("Instantes: hora local de São Paulo", () => {
  it("mostra a hora de São Paulo, não a do servidor", () => {
    assert.equal(formatDateTime(NOITE), "04/09/2026, 20:30");
  });

  /**
   * O caso que mais confunde quem olha o relatório: um acesso da noite de
   * quarta aparecendo como quinta-feira. Três horas bastam para trocar o dia.
   */
  it("depois das 21h em São Paulo, o dia em UTC já virou — e a tela não pode virar junto", () => {
    assert.equal(formatDateTime(MADRUGADA), "04/09/2026, 22:00");
    assert.equal(formatDate(MADRUGADA), "04/09/2026");
  });

  it("nulo vira traço, sem quebrar a tela", () => {
    assert.equal(formatDateTime(null), "-");
    assert.equal(formatDate(undefined), "-");
    assert.equal(formatPrazo(null), "-");
  });

  it("aceita string ISO, como vem de uma resposta JSON", () => {
    assert.equal(formatDateTime("2026-09-04T23:30:00.000Z"), "04/09/2026, 20:30");
  });
});

describe("Prazos: o dia que foi digitado", () => {
  /**
   * O `<input type="date">` manda "2026-09-05", que o `new Date()` interpreta
   * como meia-noite UTC. Exibir esse instante em São Paulo daria 04/09 — o
   * prazo apareceria um dia antes do escolhido, e o funcionário seria cobrado
   * cedo demais. Um prazo não é um momento no tempo, é um dia do calendário.
   */
  it("o prazo mostra exatamente o dia digitado no formulário", () => {
    const doFormulario = new Date("2026-09-05");
    assert.equal(formatPrazo(doFormulario), "05/09/2026");
  });

  it("e não escorrega para o dia anterior", () => {
    assert.notEqual(formatPrazo(new Date("2026-09-05")), "04/09/2026");
  });

  /**
   * A prova de que as duas funções PRECISAM ser diferentes: no mesmo valor
   * elas discordam de propósito, porque respondem a perguntas diferentes.
   */
  it("prazo e instante divergem no mesmo valor, e é intencional", () => {
    const meiaNoiteUTC = new Date("2026-09-05T00:00:00.000Z");
    assert.equal(formatPrazo(meiaNoiteUTC), "05/09/2026", "o dia do calendário");
    assert.equal(formatDate(meiaNoiteUTC), "04/09/2026", "o instante, em São Paulo");
  });

  it("uma data de virada de ano não escorrega de ano", () => {
    assert.equal(formatPrazo(new Date("2027-01-01")), "01/01/2027");
  });
});
