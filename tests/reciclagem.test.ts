import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarCurso, criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import {
  DIAS_DE_ALERTA_RECICLAGEM,
  levantarReciclagem,
  situacaoDaReciclagem,
  venceEm,
} from "../src/lib/reciclagem";

after(encerrar);

const DIA = 24 * 60 * 60 * 1000;

/**
 * Um certificado que venceu sem ninguém perceber é o achado clássico de
 * auditoria. Estas contas são a única coisa entre a rede e essa conversa, e
 * errar por um dia para mais é pior do que errar para menos.
 */
describe("Quando o certificado vence", () => {
  it("soma meses de calendário, não 30 dias", () => {
    const emitido = new Date("2026-03-05T12:00:00.000Z");
    assert.equal(venceEm(emitido, 12).toISOString().slice(0, 10), "2027-03-05");
    assert.equal(venceEm(emitido, 6).toISOString().slice(0, 10), "2026-09-05");
  });

  it("atravessa a virada do ano", () => {
    const emitido = new Date("2026-11-20T00:00:00.000Z");
    assert.equal(venceEm(emitido, 3).toISOString().slice(0, 10), "2027-02-20");
  });

  /**
   * O caso torto: 31 de janeiro mais um mês. Fevereiro não tem 31, e a soma
   * ingênua empurraria para 2 ou 3 de março — a validade GANHARIA dias, o que
   * numa reciclagem obrigatória é justamente o erro que não se pode cometer.
   */
  it("dia 31 não ganha dias num mês curto", () => {
    const emitido = new Date("2026-01-31T00:00:00.000Z");
    const vencimento = venceEm(emitido, 1).toISOString().slice(0, 10);

    assert.equal(vencimento, "2026-02-28");
    assert.ok(vencimento < "2026-03-01", "não pode escorregar para março");
  });

  it("ano bissexto: 29 de fevereiro existe em 2028", () => {
    assert.equal(
      venceEm(new Date("2028-01-31T00:00:00.000Z"), 1).toISOString().slice(0, 10),
      "2028-02-29"
    );
  });
});

describe("Situação de um certificado", () => {
  const emitido = new Date("2026-01-01T00:00:00.000Z");

  it("recém-emitido está vigente", () => {
    const r = situacaoDaReciclagem({
      emitidoEm: emitido,
      validadeMeses: 12,
      agora: new Date("2026-02-01T00:00:00.000Z"),
    });
    assert.equal(r.situacao, "vigente");
  });

  it("dentro da janela de aviso, está vencendo", () => {
    const r = situacaoDaReciclagem({
      emitidoEm: emitido,
      validadeMeses: 12,
      // 10 dias antes de 01/01/2027.
      agora: new Date("2026-12-22T00:00:00.000Z"),
    });
    assert.equal(r.situacao, "vencendo");
    assert.ok(r.diasRestantes > 0 && r.diasRestantes <= DIAS_DE_ALERTA_RECICLAGEM);
  });

  it("passada a data, está vencido e os dias ficam negativos", () => {
    const r = situacaoDaReciclagem({
      emitidoEm: emitido,
      validadeMeses: 12,
      agora: new Date("2027-01-15T00:00:00.000Z"),
    });
    assert.equal(r.situacao, "vencido");
    assert.ok(r.diasRestantes < 0);
  });

  /**
   * A janela é de 30 dias, e não de 7 como na Conformidade: reciclagem exige
   * turma, instrutor e escala coberta. Avisar em cima da hora seria avisar
   * tarde demais para servir de alguma coisa.
   */
  it("a janela de aviso é maior que a da conformidade", () => {
    assert.equal(DIAS_DE_ALERTA_RECICLAGEM, 30);
  });
});

describe("Levantamento sobre o banco", () => {
  async function comCertificado(opcoes: {
    validadeMeses: number | null;
    emitidoEm: Date;
    departamentoId?: string;
  }) {
    const setor =
      opcoes.departamentoId ??
      (await db.department.create({ data: { name: `Setor ${Date.now()}${Math.random()}` } })).id;

    const pessoa = await criarFuncionario({ departmentId: setor });
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    await db.cursoObrigatorio.create({
      data: { courseId: curso.id, departmentId: setor, validadeMeses: opcoes.validadeMeses },
    });
    await db.certificate.create({
      data: {
        userId: pessoa.id,
        courseId: curso.id,
        code: `C-${Math.random().toString(36).slice(2, 10)}`,
        issuedAt: opcoes.emitidoEm,
      },
    });

    return { pessoa, curso, setor };
  }

  it("certificado vencido aparece", async () => {
    const { pessoa } = await comCertificado({
      validadeMeses: 12,
      emitidoEm: new Date(Date.now() - 400 * DIA),
    });

    const { linhas } = await levantarReciclagem({});
    const dele = linhas.find((l) => l.userId === pessoa.id);

    assert.ok(dele, "deveria aparecer");
    assert.equal(dele!.situacao, "vencido");
  });

  /**
   * Sem validade declarada, o curso vale para sempre — que era o único
   * comportamento possível antes deste módulo. Incluir esses certificados
   * encheria a lista com gente que não deve nada.
   */
  it("curso sem validade não entra na lista", async () => {
    const { pessoa } = await comCertificado({
      validadeMeses: null,
      emitidoEm: new Date(Date.now() - 4000 * DIA),
    });

    const { linhas } = await levantarReciclagem({});
    assert.equal(linhas.find((l) => l.userId === pessoa.id), undefined);
  });

  /**
   * Quem saiu do setor não deve mais a reciclagem daquele setor. Sem esta
   * regra, a lista cobraria para sempre quem foi transferido — e cobrança
   * errada é o que ensina todo mundo a ignorar a lista.
   */
  it("quem saiu do departamento sai da cobrança", async () => {
    const { pessoa } = await comCertificado({
      validadeMeses: 12,
      emitidoEm: new Date(Date.now() - 400 * DIA),
    });

    const outro = await db.department.create({ data: { name: `Outro ${Math.random()}` } });
    await db.user.update({ where: { id: pessoa.id }, data: { departmentId: outro.id } });

    const { linhas } = await levantarReciclagem({});
    assert.equal(linhas.find((l) => l.userId === pessoa.id), undefined);
  });

  it("o resumo soma o que as linhas dizem", async () => {
    const { linhas, resumo } = await levantarReciclagem({});
    assert.equal(resumo.vigente + resumo.vencendo + resumo.vencido, resumo.total);
    assert.equal(resumo.total, linhas.length);
  });

  it("vencido aparece antes de vigente", async () => {
    const setorA = (await db.department.create({ data: { name: `A ${Math.random()}` } })).id;
    await comCertificado({
      validadeMeses: 12,
      emitidoEm: new Date(Date.now() - 400 * DIA),
      departamentoId: setorA,
    });
    await comCertificado({
      validadeMeses: 12,
      emitidoEm: new Date(),
      departamentoId: setorA,
    });

    const { linhas } = await levantarReciclagem({ departamentoId: setorA });
    assert.ok(linhas.length >= 2);
    assert.equal(linhas[0].situacao, "vencido", "o vencido precisa vir primeiro");
  });
});
