import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { confirmarEmail } from "../src/lib/actions/email-pessoal";

after(encerrar);

/**
 * Confirmação do e-mail pessoal.
 *
 * Esta é a peça sensível do cadastro por nome de usuário: o endereço
 * confirmado é o ÚNICO caminho pelo qual alguém recupera a própria senha sem o
 * RH, e portanto quem controla aquela caixa controla a conta. Cada teste aqui
 * corresponde a um jeito de o endereço errado acabar gravado.
 *
 * `solicitarConfirmacaoDeEmail` e `removerEmail` não são exercitados: dependem
 * de sessão do NextAuth, que a suíte não monta. O que elas gravam é conferido
 * pelo lado de cá, que é onde o dado realmente entra no cadastro.
 */

let contador = 0;
const proximo = () => (contador += 1);

async function pedidoDe(
  userId: string,
  opcoes: { email?: string; expiraEm?: Date; usadoEm?: Date | null } = {}
) {
  const n = proximo();
  return db.emailConfirmacao.create({
    data: {
      userId,
      email: opcoes.email ?? `pessoa${n}@gmail.com`,
      token: `tok-${n}-${userId}`,
      expiresAt: opcoes.expiraEm ?? new Date(Date.now() + 3_600_000),
      usedAt: opcoes.usadoEm ?? null,
    },
  });
}

async function emailDe(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return u.email;
}

describe("Confirmação bem-sucedida", () => {
  it("grava o endereço na conta e consome o link", async () => {
    const pessoa = await criarFuncionario();
    assert.equal(await emailDe(pessoa.id), null, "nasce sem e-mail");

    const pedido = await pedidoDe(pessoa.id, { email: "confirmado@gmail.com" });
    const r = await confirmarEmail(pedido.token);

    assert.equal(r.ok, true);
    assert.equal(await emailDe(pessoa.id), "confirmado@gmail.com");

    const depois = await db.emailConfirmacao.findUniqueOrThrow({
      where: { token: pedido.token },
    });
    assert.ok(depois.usedAt, "o link tem de ficar marcado como usado");
  });

  /**
   * Uso único de verdade. Sem isto, um link vazado num histórico de navegador
   * ou num encaminhamento continuaria valendo para regravar o endereço.
   */
  it("o mesmo link não serve duas vezes", async () => {
    const pessoa = await criarFuncionario();
    const pedido = await pedidoDe(pessoa.id, { email: "unico@gmail.com" });

    assert.equal((await confirmarEmail(pedido.token)).ok, true);
    const segunda = await confirmarEmail(pedido.token);

    assert.equal(segunda.ok, false);
    assert.equal(await emailDe(pessoa.id), "unico@gmail.com", "o endereço não muda");
  });

  it("trocar de endereço substitui o anterior", async () => {
    const pessoa = await criarFuncionario();

    const primeiro = await pedidoDe(pessoa.id, { email: "antigo@gmail.com" });
    await confirmarEmail(primeiro.token);

    const segundo = await pedidoDe(pessoa.id, { email: "novo@gmail.com" });
    await confirmarEmail(segundo.token);

    assert.equal(await emailDe(pessoa.id), "novo@gmail.com");
  });
});

describe("Links que não podem valer", () => {
  it("token desconhecido é recusado", async () => {
    const r = await confirmarEmail("nao-existe");
    assert.equal(r.ok, false);
  });

  it("link vencido é recusado", async () => {
    const pessoa = await criarFuncionario();
    const pedido = await pedidoDe(pessoa.id, {
      email: "vencido@gmail.com",
      expiraEm: new Date(Date.now() - 1000),
    });

    const r = await confirmarEmail(pedido.token);

    assert.equal(r.ok, false);
    assert.equal(await emailDe(pessoa.id), null, "nada foi gravado");
  });

  it("link já marcado como usado é recusado", async () => {
    const pessoa = await criarFuncionario();
    const pedido = await pedidoDe(pessoa.id, {
      email: "queimado@gmail.com",
      usadoEm: new Date(),
    });

    assert.equal((await confirmarEmail(pedido.token)).ok, false);
    assert.equal(await emailDe(pessoa.id), null);
  });
});

describe("Duas pessoas na mesma caixa", () => {
  /**
   * O caso real é o casal que divide um e-mail, os dois funcionários da rede.
   *
   * Se os dois conseguissem registrar o mesmo endereço, qualquer um deles
   * pediria "esqueci minha senha" da conta do outro e receberia o link na
   * caixa que ambos leem — e entraria numa conta que não é a dele, com o
   * histórico de treinamento e os certificados junto.
   */
  it("o segundo é recusado, e o primeiro fica intacto", async () => {
    const primeira = await criarFuncionario();
    const segunda = await criarFuncionario();

    const pedidoA = await pedidoDe(primeira.id, { email: "casa@gmail.com" });
    assert.equal((await confirmarEmail(pedidoA.token)).ok, true);

    const pedidoB = await pedidoDe(segunda.id, { email: "casa@gmail.com" });
    const r = await confirmarEmail(pedidoB.token);

    assert.equal(r.ok, false, "a segunda conta não pode tomar a mesma caixa");
    assert.equal(await emailDe(primeira.id), "casa@gmail.com", "a primeira não é afetada");
    assert.equal(await emailDe(segunda.id), null);
  });

  /**
   * A corrida: os dois pedem o link ANTES de qualquer confirmação, e o segundo
   * clica depois. A checagem feita na hora do pedido já passou — só a checagem
   * no momento de gravar impede isto.
   */
  it("dois links emitidos antes, o segundo clique ainda é barrado", async () => {
    const primeira = await criarFuncionario();
    const segunda = await criarFuncionario();

    const pedidoA = await pedidoDe(primeira.id, { email: "corrida@gmail.com" });
    const pedidoB = await pedidoDe(segunda.id, { email: "corrida@gmail.com" });

    assert.equal((await confirmarEmail(pedidoA.token)).ok, true);
    assert.equal((await confirmarEmail(pedidoB.token)).ok, false);

    assert.equal(await emailDe(segunda.id), null);

    // E o link perdedor não fica valendo à espera de a primeira conta liberar
    // o endereço: ele é queimado na recusa.
    const perdedor = await db.emailConfirmacao.findUniqueOrThrow({
      where: { token: pedidoB.token },
    });
    assert.ok(perdedor.usedAt, "o link recusado tem de ser consumido");
  });

  it("reconfirmar o próprio endereço continua funcionando", async () => {
    const pessoa = await criarFuncionario();

    const um = await pedidoDe(pessoa.id, { email: "mesmo@gmail.com" });
    await confirmarEmail(um.token);

    const dois = await pedidoDe(pessoa.id, { email: "mesmo@gmail.com" });
    const r = await confirmarEmail(dois.token);

    assert.equal(r.ok, true, "o dono do endereço não colide consigo mesmo");
    assert.equal(await emailDe(pessoa.id), "mesmo@gmail.com");
  });
});
