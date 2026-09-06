import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, criarCurso, criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { chaveDeConclusao, conclusoesPorCurso } from "../src/lib/conclusoes";
import { levantarObrigacoes, situacaoDaObrigacao } from "../src/lib/conformidade";
import { levantarReciclagem } from "../src/lib/reciclagem";
import { levantarAuditoria } from "../src/lib/auditoria";

after(encerrar);

const DIA = 24 * 60 * 60 * 1000;

/**
 * Treinamento presencial reconhecido na plataforma.
 *
 * A plataforma só conhecia o que ela mesma entregou. Numa rede hoteleira, boa
 * parte do treinamento obrigatório acontece em sala — brigada de incêndio
 * exige prática. O efeito era a Conformidade cobrar quem já tinha feito, e o
 * relatório de auditoria sair INCOMPLETO afirmando estar completo.
 *
 * As três telas precisam concordar. Por isso os testes abaixo perguntam a
 * mesma coisa às três: uma discordância aqui aparece do pior jeito possível —
 * a tela dizendo doze pendentes e o papel dizendo nove.
 */

async function cenario(opcoes: { validadeMeses?: number | null; concluidoEm?: Date } = {}) {
  const setor = await db.department.create({
    data: { name: `Setor ${Math.random().toString(36).slice(2, 8)}` },
  });
  const pessoa = await criarFuncionario({ departmentId: setor.id });
  const admin = await criarAdministrador();
  const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

  await db.cursoObrigatorio.create({
    data: {
      courseId: curso.id,
      departmentId: setor.id,
      prazoDias: 30,
      validadeMeses: opcoes.validadeMeses ?? null,
    },
  });

  // Matrícula com prazo JÁ VENCIDO: sem o reconhecimento, esta pessoa aparece
  // como atrasada em toda tela.
  await db.enrollment.create({
    data: {
      userId: pessoa.id,
      courseId: curso.id,
      mandatory: true,
      dueDate: new Date(Date.now() - 10 * DIA),
    },
  });

  return { setor, pessoa, admin, curso };
}

async function reconhecer(
  userId: string,
  courseId: string,
  registradoPorId: string,
  concluidoEm: Date
) {
  return db.conclusaoExterna.create({
    data: { userId, courseId, concluidoEm, registradoPorId, instrutor: "Corpo de Bombeiros" },
  });
}

describe("A regra pura", () => {
  it("sem conclusão externa, prazo vencido é atrasado", () => {
    const r = situacaoDaObrigacao({
      percent: 0,
      dueDate: new Date(Date.now() - 10 * DIA),
      agora: new Date(),
    });
    assert.equal(r.situacao, "atrasado");
    assert.equal(r.concluido, false);
  });

  /**
   * O ponto do recurso: quem fez em sala está treinado, mesmo com a plataforma
   * mostrando 0% de progresso. A pergunta da conformidade é "a pessoa está
   * treinada?", não "a plataforma ensinou?".
   */
  it("com conclusão externa, o mesmo caso vira em dia", () => {
    const r = situacaoDaObrigacao({
      percent: 0,
      dueDate: new Date(Date.now() - 10 * DIA),
      agora: new Date(),
      concluidoExternamente: true,
    });
    assert.equal(r.situacao, "em_dia");
    assert.equal(r.concluido, true);
  });
});

describe("A fonte compartilhada", () => {
  it("enxerga certificado da plataforma e registro presencial", async () => {
    const { pessoa, admin, curso } = await cenario();

    await reconhecer(pessoa.id, curso.id, admin.id, new Date(Date.now() - 30 * DIA));
    const mapa = await conclusoesPorCurso([curso.id]);
    const dele = mapa.get(chaveDeConclusao(pessoa.id, curso.id));

    assert.ok(dele);
    assert.equal(dele!.origem, "externa");
    assert.equal(dele!.codigo, null, "presencial não tem código da plataforma");
    assert.equal(dele!.instrutor, "Corpo de Bombeiros");
  });

  /**
   * Quem fez presencialmente e depois refez pela plataforma tem as duas. Vale
   * a MAIS RECENTE: é dela que a validade deve contar, senão quem acabou de
   * reciclar apareceria como vencido.
   */
  it("tendo as duas, vale a mais recente", async () => {
    const { pessoa, admin, curso } = await cenario();

    await reconhecer(pessoa.id, curso.id, admin.id, new Date(Date.now() - 400 * DIA));
    await db.certificate.create({
      data: {
        userId: pessoa.id,
        courseId: curso.id,
        code: `CERT-${Math.random().toString(36).slice(2, 12)}`,
        issuedAt: new Date(),
      },
    });

    const dele = (await conclusoesPorCurso([curso.id])).get(
      chaveDeConclusao(pessoa.id, curso.id)
    );

    assert.equal(dele!.origem, "plataforma", "a conclusão de hoje vence a de um ano atrás");
  });
});

describe("As três telas concordam", () => {
  it("Conformidade deixa de cobrar quem fez presencialmente", async () => {
    const { pessoa, admin, curso, setor } = await cenario();

    const antes = (await levantarObrigacoes({ departamentoId: setor.id })).linhas.find(
      (l) => l.userId === pessoa.id
    );
    assert.equal(antes?.situacao, "atrasado", "antes do reconhecimento, está atrasado");

    await reconhecer(pessoa.id, curso.id, admin.id, new Date(Date.now() - 30 * DIA));

    const depois = (await levantarObrigacoes({ departamentoId: setor.id })).linhas.find(
      (l) => l.userId === pessoa.id
    );
    assert.equal(depois?.situacao, "em_dia", "depois, sai da cobrança");
    assert.equal(depois?.concluido, true);
  });

  it("o relatório de auditoria conta como regular, sem inventar código", async () => {
    const { pessoa, admin, curso, setor } = await cenario();
    await reconhecer(pessoa.id, curso.id, admin.id, new Date(Date.now() - 30 * DIA));

    const r = await levantarAuditoria({ departamentoId: setor.id });
    const linha = r.blocos.flatMap((b) => b.pessoas).find((p) => p.username === pessoa.username);

    assert.equal(linha?.situacao, "concluido");
    assert.equal(linha?.origem, "externa");
    assert.equal(linha?.codigo, null, "a plataforma não certifica o que não entregou");
    assert.equal(linha?.instrutor, "Corpo de Bombeiros");
    assert.equal(r.regulares, 1);
  });

  /**
   * O presencial precisa VENCER como qualquer outro. Antes disto, quem fazia
   * brigada de incêndio numa sala nunca era cobrado para reciclar — a
   * plataforma não sabia que tinha feito da primeira vez.
   */
  it("Reciclagem cobra o presencial vencido", async () => {
    const { pessoa, admin, curso, setor } = await cenario({ validadeMeses: 12 });

    // Feito há mais de um ano: já venceu.
    await reconhecer(pessoa.id, curso.id, admin.id, new Date(Date.now() - 400 * DIA));

    const { linhas } = await levantarReciclagem({ departamentoId: setor.id });
    const dele = linhas.find((l) => l.userId === pessoa.id);

    assert.ok(dele, "presencial vencido precisa aparecer na reciclagem");
    assert.equal(dele!.situacao, "vencido");
    assert.equal(dele!.origem, "externa");
  });

  it("presencial recente fica vigente, e não é cobrado", async () => {
    const { pessoa, admin, curso, setor } = await cenario({ validadeMeses: 12 });
    await reconhecer(pessoa.id, curso.id, admin.id, new Date(Date.now() - 30 * DIA));

    const { linhas } = await levantarReciclagem({ departamentoId: setor.id });
    const dele = linhas.find((l) => l.userId === pessoa.id);

    assert.equal(dele?.situacao, "vigente");
  });
});
