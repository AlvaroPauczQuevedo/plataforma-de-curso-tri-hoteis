import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarCurso, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { levantarObrigacoes } from "../src/lib/conformidade";
import { levantarPrimeiroAcesso } from "../src/lib/primeiro-acesso";

after(encerrar);

/**
 * O filtro por hotel nas telas de cobrança.
 *
 * A rede tem 25 unidades e seis cidades com mais de uma. Sem este filtro, o
 * gerente de um hotel abre Conformidade e recebe a rede inteira — e "quem do
 * Canela ainda não fez o treinamento obrigatório" fica sem resposta.
 *
 * O que estes testes travam é a combinação: hotel e departamento se SOMAM. Se
 * um substituísse o outro, a tela devolveria a rede inteira de um setor quando
 * a pergunta era sobre uma casa só — e ninguém perceberia, porque a lista viria
 * cheia de gente plausível.
 *
 * As listas vêm rasas, só com `userId` (é o desenho de `levantarObrigacoes`),
 * então a comparação é por identificador.
 */

let sequencia = 0;

/** Uma pessoa ativa, num hotel e num setor. */
async function pessoa(unidadeId: string | null, departmentId: string | null) {
  sequencia += 1;
  return db.user.create({
    data: {
      name: `Pessoa ${sequencia}`,
      username: `pessoa.hotel.${sequencia}`,
      passwordHash: "x",
      role: "EMPLOYEE",
      active: true,
      unidadeId,
      departmentId,
    },
  });
}

describe("Filtro por hotel", () => {
  it("separa a conformidade por unidade", async () => {
    const canela = await db.unidade.create({ data: { name: "Tri Hotel Canela" } });
    const xanxere = await db.unidade.create({ data: { name: "Tri Hotel Xanxere" } });
    const recepcao = await db.department.create({ data: { name: "Recepcao Conf" } });

    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    const daCanela = await pessoa(canela.id, recepcao.id);
    const doXanxere = await pessoa(xanxere.id, recepcao.id);

    for (const p of [daCanela, doXanxere]) {
      await db.enrollment.create({
        data: { userId: p.id, courseId: curso.id, mandatory: true },
      });
    }

    const todos = await levantarObrigacoes({});
    const idsDeTodos = todos.linhas.map((l) => l.userId);
    assert.ok(idsDeTodos.includes(daCanela.id));
    assert.ok(idsDeTodos.includes(doXanxere.id));

    const so = await levantarObrigacoes({ unidadeId: canela.id });
    const ids = so.linhas.map((l) => l.userId);
    assert.ok(ids.includes(daCanela.id));
    assert.equal(ids.includes(doXanxere.id), false, "não deveria trazer outro hotel");
  });

  it("soma hotel e departamento em vez de trocar um pelo outro", async () => {
    /*
      É o caso do gerente de unidade: ele quer a Recepção DA CASA DELE. Se as
      duas dimensões se substituíssem, viria a Recepção da rede inteira.
    */
    const lajeado = await db.unidade.create({ data: { name: "Tri Hotel Lajeado" } });
    const osorio = await db.unidade.create({ data: { name: "Tri Hotel Osorio" } });
    const recepcao = await db.department.create({ data: { name: "Recepcao Soma" } });
    const governanca = await db.department.create({ data: { name: "Governanca Soma" } });

    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    const alvo = await pessoa(lajeado.id, recepcao.id);
    const outroSetor = await pessoa(lajeado.id, governanca.id);
    const outroHotel = await pessoa(osorio.id, recepcao.id);

    for (const p of [alvo, outroSetor, outroHotel]) {
      await db.enrollment.create({
        data: { userId: p.id, courseId: curso.id, mandatory: true },
      });
    }

    const cruzado = await levantarObrigacoes({
      unidadeId: lajeado.id,
      departamentoId: recepcao.id,
    });

    assert.deepEqual(cruzado.linhas.map((l) => l.userId), [alvo.id]);
  });

  it("separa o primeiro acesso por unidade", async () => {
    const itapema = await db.unidade.create({ data: { name: "Tri Hotel Itapema" } });
    const brusque = await db.unidade.create({ data: { name: "Tri Hotel Brusque" } });

    const daItapema = await pessoa(itapema.id, null);
    const doBrusque = await pessoa(brusque.id, null);

    const so = await levantarPrimeiroAcesso({ unidadeId: itapema.id });
    const ids = so.linhas.map((l) => l.userId);
    assert.ok(ids.includes(daItapema.id));
    assert.equal(ids.includes(doBrusque.id), false);
  });

  it("sem filtro, continua trazendo a rede inteira", async () => {
    // O padrão não pode mudar: quem administra a rede vê a rede.
    const sem = await levantarPrimeiroAcesso({});
    assert.ok(sem.linhas.length >= 2);
  });
});
