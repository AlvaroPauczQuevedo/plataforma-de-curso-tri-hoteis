import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { revalidarConta } from "../src/lib/conta-vigente";

after(encerrar);

/**
 * O papel que vale é o do banco, e não o do token.
 *
 * A sessão é um JWT de 8 horas que guarda o papel do momento do login. Antes,
 * `requireAdmin` conferia esse papel, e por isso um administrador REBAIXADO
 * continuava com o painel inteiro por até 8 horas: cadastrar e excluir gente,
 * redefinir senha, apagar curso. A desativação já valia na hora e o
 * rebaixamento não. Estes testes cobrem os dois lados da troca de papel.
 *
 * `token` aqui é o que o JWT diria. O banco é mudado por baixo dele, que é o
 * que acontece quando outro administrador edita a conta durante a sessão.
 */

describe("Papel", () => {
  it("administrador que continua administrador segue passando", async () => {
    const admin = await criarAdministrador();
    const token = { id: admin.id, role: "ADMIN" as const };

    const conta = await revalidarConta(token);

    assert.equal(conta?.role, "ADMIN");
  });

  it("rebaixado perde o papel na hora, com o token ainda dizendo ADMIN", async () => {
    const admin = await criarAdministrador();
    const token = { id: admin.id, role: "ADMIN" as const };

    await db.user.update({ where: { id: admin.id }, data: { role: "EMPLOYEE" } });

    const conta = await revalidarConta(token);

    assert.ok(conta, "a conta continua ativa: é rebaixamento, não desligamento");
    assert.equal(conta.role, "EMPLOYEE", "o papel do banco vence o do token");
  });

  it("promovido ganha o papel na hora, com o token ainda dizendo EMPLOYEE", async () => {
    const pessoa = await criarFuncionario();
    const token = { id: pessoa.id, role: "EMPLOYEE" as const };

    await db.user.update({ where: { id: pessoa.id }, data: { role: "ADMIN" } });

    assert.equal((await revalidarConta(token))?.role, "ADMIN");
  });
});

describe("Situação da conta", () => {
  it("conta desativada não passa, nem sendo administrador", async () => {
    const admin = await criarAdministrador();
    await db.user.update({ where: { id: admin.id }, data: { active: false } });

    assert.equal(await revalidarConta({ id: admin.id, role: "ADMIN" }), null);
  });

  it("conta apagada não passa", async () => {
    const pessoa = await criarFuncionario();
    await db.user.delete({ where: { id: pessoa.id } });

    assert.equal(await revalidarConta({ id: pessoa.id, role: "EMPLOYEE" }), null);
  });
});

describe("O resto do token", () => {
  it("nome e avatar seguem como vieram; só o papel é corrigido", async () => {
    /*
      Nome e avatar são exibição. Errar neles por algumas horas não abre porta
      nenhuma, e reler do banco só para mostrar o cabeçalho seria consulta sem
      motivo. O papel e a situação são as duas coisas que decidem acesso.
    */
    const admin = await criarAdministrador();
    await db.user.update({ where: { id: admin.id }, data: { role: "EMPLOYEE" } });

    const token = {
      id: admin.id,
      role: "ADMIN" as const,
      name: "Nome do token",
      avatarUrl: "/api/files/avatar-do-token",
    };

    const conta = await revalidarConta(token);

    assert.deepEqual(conta, { ...token, role: "EMPLOYEE" });
  });
});
