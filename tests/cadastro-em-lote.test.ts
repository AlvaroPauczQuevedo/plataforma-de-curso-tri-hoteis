import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, criarCurso, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { executarLoteDeFuncionarios } from "../src/lib/cadastro-em-lote";
import { verifyPassword } from "../src/lib/password";

after(encerrar);

/**
 * O cadastro de funcionários em lote, com banco de verdade.
 *
 * A regra de como um nome vira login é testada em `lote-de-funcionarios`. Aqui
 * se verifica o que só aparece com o banco na frente: se as pessoas são criadas
 * mesmo, se a senha devolvida abre a conta, se elas já entram nos treinamentos
 * obrigatórios do setor, e se uma linha ruim impede o lote inteiro.
 */

describe("Cadastro de funcionários em lote", () => {
  it("cria as pessoas com a senha que devolveu", async () => {
    const admin = await criarAdministrador();
    const departamento = await db.department.create({ data: { name: "Recepção Lote1" } });

    const resultado = await executarLoteDeFuncionarios({
      adminId: admin.id,
      texto: "Marina Torres Aguiar; Recepcionista\nRafael Prado Nunes",
      departmentId: departamento.id,
    });

    assert.ok(resultado.ok, "o lote deveria ter sido aceito");
    assert.equal(resultado.pessoas.length, 2);

    const marina = await db.user.findUnique({ where: { username: "marina.aguiar" } });
    assert.ok(marina, "Marina deveria ter sido criada");
    assert.equal(marina.name, "Marina Torres Aguiar");
    assert.equal(marina.position, "Recepcionista");
    assert.equal(marina.departmentId, departamento.id);
    // Senha feita por outra pessoa vale só até o primeiro acesso.
    assert.equal(marina.mustChangePassword, true);

    /*
      A senha mostrada na tela precisa ABRIR a conta. É a única cópia dela: não
      é gravada em lugar nenhum, então se não conferir com o hash, a pessoa
      simplesmente não entra e ninguém consegue descobrir por quê.
    */
    const senhaDaMarina = resultado.pessoas.find((p) => p.usuario === "marina.aguiar")?.senha;
    assert.ok(senhaDaMarina);
    assert.ok(await verifyPassword(senhaDaMarina, marina.passwordHash));
  });

  it("já matricula no que é obrigatório do setor", async () => {
    /*
      Sem isto, sessenta pessoas cadastradas em lote nasceriam fora dos
      treinamentos obrigatórios do próprio departamento — e a tela de
      Conformidade as mostraria em dia, porque não deveriam nada a ninguém.
    */
    const admin = await criarAdministrador();
    const departamento = await db.department.create({ data: { name: "Governança Lote2" } });
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await db.cursoObrigatorio.create({
      data: { courseId: curso.id, departmentId: departamento.id },
    });

    const resultado = await executarLoteDeFuncionarios({
      adminId: admin.id,
      texto: "Beatriz Camargo Ramos",
      departmentId: departamento.id,
    });
    assert.ok(resultado.ok);

    const pessoa = await db.user.findUnique({ where: { username: "beatriz.ramos" } });
    assert.ok(pessoa);

    const matricula = await db.enrollment.findFirst({
      where: { userId: pessoa.id, courseId: curso.id },
    });
    assert.ok(matricula, "deveria ter entrado matriculada no curso obrigatório");
    assert.equal(matricula.mandatory, true);
  });

  it("desempata homônimo contra quem JÁ está cadastrado", async () => {
    const admin = await criarAdministrador();
    await db.user.create({
      data: {
        name: "Paulo Silva",
        username: "paulo.silva",
        passwordHash: "x",
        role: "EMPLOYEE",
      },
    });

    const resultado = await executarLoteDeFuncionarios({
      adminId: admin.id,
      texto: "Paulo Henrique Silva",
    });

    assert.ok(resultado.ok);
    assert.equal(resultado.pessoas[0].usuario, "paulo.henrique.silva");
    assert.ok(await db.user.findUnique({ where: { username: "paulo.henrique.silva" } }));
  });

  it("não grava NADA quando uma linha tem problema", async () => {
    /*
      Tudo ou nada. Gravar as boas e reclamar do resto deixaria quem cadastra
      com uma lista pela metade para reconciliar à mão, sem saber quem entrou.
    */
    const admin = await criarAdministrador();
    const antes = await db.user.count();

    const resultado = await executarLoteDeFuncionarios({
      adminId: admin.id,
      // A segunda linha não vira nome de usuário válido.
      texto: "Helena Vaz Coutinho\n!!!\nIgor Salles Bastos",
    });

    assert.equal(resultado.ok, false);
    assert.equal(await db.user.count(), antes, "nenhuma pessoa deveria ter sido criada");
    assert.equal(await db.user.findUnique({ where: { username: "helena.coutinho" } }), null);

    // E a lista volta inteira, marcando qual linha precisa de ajuste.
    assert.ok(resultado.ok === false && resultado.pessoas);
    const marcadas = resultado.pessoas.filter((p) => p.problema);
    assert.equal(marcadas.length, 1);
  });

  it("recusa lista vazia", async () => {
    const admin = await criarAdministrador();
    const resultado = await executarLoteDeFuncionarios({ adminId: admin.id, texto: "  \n\n " });
    assert.equal(resultado.ok, false);
  });

  it("registra UM evento de auditoria para o lote inteiro", async () => {
    // Sessenta linhas iguais afogariam o histórico do dia.
    const admin = await criarAdministrador();
    const antes = await db.adminActivityLog.count({ where: { adminId: admin.id } });

    const resultado = await executarLoteDeFuncionarios({
      adminId: admin.id,
      texto: "Tiago Moraes Pinto\nLuiza Barros Freitas\nOtavio Nunes Rocha",
    });
    assert.ok(resultado.ok);

    const depois = await db.adminActivityLog.count({ where: { adminId: admin.id } });
    assert.equal(depois - antes, 1);
  });
});
