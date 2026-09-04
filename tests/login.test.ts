import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import {
  LoginBloqueado,
  ipDaRequisicao,
  permitirTentativa,
  registrarFalha,
  registrarSucesso,
} from "../src/lib/login-guard";

after(encerrar);

/** Limites vindos de tests/ambiente.ts: 3 erros por conta, 8 por origem. */
const MAX_POR_CONTA = 3;
const MAX_POR_ORIGEM = 8;

/** Executa a tentativa e devolve a mensagem de bloqueio, ou null se passou. */
async function tentar(identificador: string, ip: string): Promise<string | null> {
  try {
    await permitirTentativa(identificador, ip);
    return null;
  } catch (erro) {
    assert.ok(erro instanceof LoginBloqueado, "só LoginBloqueado deve escapar daqui");
    return (erro as Error).message;
  }
}

describe("Bloqueio por conta", () => {
  it("trava depois de erros seguidos e recusa até a senha certa", async () => {
    const alvo = await criarFuncionario();

    for (let i = 0; i < MAX_POR_CONTA; i += 1) {
      assert.equal(await tentar(alvo.username, "10.0.0.1"), null, `tentativa ${i + 1} liberada`);
      await registrarFalha(alvo.username, "10.0.0.1");
    }

    const mensagem = await tentar(alvo.username, "10.0.0.1");
    assert.ok(mensagem, "a tentativa seguinte é barrada");
    assert.match(mensagem!, /bloqueado temporariamente/i);
  });

  it("o bloqueio não vaza para outras contas", async () => {
    const alvo = await criarFuncionario();
    const vizinho = await criarFuncionario();

    for (let i = 0; i < MAX_POR_CONTA; i += 1) await registrarFalha(alvo.username, "10.0.0.2");

    assert.ok(await tentar(alvo.username, "10.0.0.2"), "o alvo está bloqueado");
    assert.equal(await tentar(vizinho.username, "10.0.0.3"), null, "o vizinho passa normalmente");
  });

  it("acertar a senha zera o contador", async () => {
    const alvo = await criarFuncionario();

    // Dois erros — um a menos que o limite.
    await registrarFalha(alvo.username, "10.0.0.4");
    await registrarFalha(alvo.username, "10.0.0.4");
    await registrarSucesso(alvo.id, alvo.username, "10.0.0.4");

    const depois = await db.user.findUnique({ where: { id: alvo.id } });
    assert.equal(depois!.failedAttempts, 0);
    assert.equal(depois!.lockedUntil, null);

    // O ciclo recomeça: mais dois erros ainda não bloqueiam.
    await registrarFalha(alvo.username, "10.0.0.4");
    await registrarFalha(alvo.username, "10.0.0.4");
    assert.equal(await tentar(alvo.username, "10.0.0.4"), null);
  });

  it("o bloqueio expira sozinho", async () => {
    const alvo = await criarFuncionario();
    for (let i = 0; i < MAX_POR_CONTA; i += 1) await registrarFalha(alvo.username, "10.0.0.5");
    assert.ok(await tentar(alvo.username, "10.0.0.5"), "bloqueado agora");

    // Empurra o fim do bloqueio para o passado, como o relógio faria.
    await db.user.update({
      where: { id: alvo.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    assert.equal(await tentar(alvo.username, "10.0.0.5"), null, "liberado após o prazo");
  });

  it("e-mail que não existe não revela nada nem quebra", async () => {
    const inexistente = "ninguem@teste.local";
    await registrarFalha(inexistente, "10.0.0.6");
    assert.equal(await tentar(inexistente, "10.0.0.6"), null);
    assert.equal(await db.loginAttempt.count({ where: { identificador: inexistente } }), 1);
  });
});

describe("Bloqueio por origem", () => {
  it("barra quem tenta poucas senhas em muitas contas", async () => {
    const ip = "203.0.113.7";
    // Uma tentativa em cada conta: nenhuma delas chega perto do limite
    // individual, mas somadas estouram o teto da origem.
    for (let i = 0; i < MAX_POR_ORIGEM; i += 1) {
      const vitima = await criarFuncionario();
      assert.equal(await tentar(vitima.username, ip), null);
      await registrarFalha(vitima.username, ip);
    }

    const nova = await criarFuncionario();
    const mensagem = await tentar(nova.username, ip);
    assert.ok(mensagem, "a origem foi barrada");
    assert.match(mensagem!, /deste dispositivo/i);
  });

  it("outra origem não é afetada", async () => {
    const limpa = await criarFuncionario();
    assert.equal(await tentar(limpa.username, "198.51.100.4"), null);
  });
});

describe("Origem da requisição", () => {
  it("ignora x-forwarded-for quando não há proxy confiável", () => {
    process.env.TRUST_PROXY = "false";
    const ip = ipDaRequisicao({ "x-forwarded-for": "1.2.3.4" });
    assert.equal(ip, "", "sem proxy, o cabeçalho do cliente não vale");
  });

  it("aceita x-forwarded-for com proxy confiável, usando o primeiro salto", () => {
    process.env.TRUST_PROXY = "true";
    const ip = ipDaRequisicao({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    assert.equal(ip, "1.2.3.4");
    process.env.TRUST_PROXY = "false";
  });

  it("sem cabeçalhos, devolve vazio em vez de quebrar", () => {
    assert.equal(ipDaRequisicao(undefined), "");
  });
});
