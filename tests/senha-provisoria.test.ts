import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarFuncionario, db, encerrar } from "./ambiente";

/*
  ANTES da action de redefinição: o teto de pedidos grava a contagem ao lado do
  registro de erros, e sem o desvio o arquivo cairia dentro do projeto.
*/
import { limparPastaDeErros } from "./erros-temporarios";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { senhaProvisoria, verifyPassword } from "../src/lib/password";
import { LoginBloqueado, permitirTentativa, registrarFalha } from "../src/lib/login-guard";
import { requestPasswordReset, resetPassword } from "../src/lib/actions/password-reset";
import { AVISO_SENHA_CURTA, SENHA_MINIMA } from "../src/lib/regra-de-senha";
import { digestDoToken } from "../src/lib/token-de-redefinicao";

after(encerrar);
after(limparPastaDeErros);

/** Grava um pedido de redefinição do jeito que a plataforma grava: pelo digest. */
async function pedidoPendente(userId: string, token: string) {
  await db.passwordResetToken.create({
    data: { userId, token: digestDoToken(token), expiresAt: new Date(Date.now() + 3_600_000) },
  });
}

function formulario(senha: string) {
  const dados = new FormData();
  dados.set("password", senha);
  dados.set("confirmPassword", senha);
  return dados;
}

/** Limite vindo de tests/ambiente.ts. */
const MAX_POR_CONTA = 3;

/** A barreira de login deixou passar? */
async function passaNaBarreira(email: string): Promise<boolean> {
  try {
    await permitirTentativa(email, "");
    return true;
  } catch (erro) {
    assert.ok(erro instanceof LoginBloqueado, "só LoginBloqueado deve escapar daqui");
    return false;
  }
}

describe("Senha provisória", () => {
  /*
    O cadastro de funcionário usava `randomUUID().slice(0, 10)`: cerca de 36
    bits, e com um hífen no meio — exatamente onde quem lê a senha em voz alta
    erra. A sincronização com a intranet já tinha um gerador melhor; agora é um
    só, e estes testes descrevem o que ele promete.
  */

  it("tem o formato que dá para ditar por telefone", async () => {
    for (let i = 0; i < 50; i += 1) {
      assert.match(senhaProvisoria(), /^Tri-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("não usa nenhum caractere ambíguo", async () => {
    /*
      Os pares que se confundem ao ditar: O com zero, I com um.

      O "L" maiúsculo FICA no alfabeto de propósito — quem se parece com o
      algarismo um é o "l" minúsculo, e aqui não existe minúscula nenhuma.
    */
    const ambiguos = /[O0I1]/;

    for (let i = 0; i < 500; i += 1) {
      const gerada = senhaProvisoria().slice(4); // sem o prefixo "Tri-"
      assert.ok(!ambiguos.test(gerada), `caractere ambíguo em ${gerada}`);
    }
  });

  it("não repete", async () => {
    const geradas = new Set<string>();
    for (let i = 0; i < 1000; i += 1) geradas.add(senhaProvisoria());

    assert.equal(geradas.size, 1000);
  });
});

describe("Redefinir a senha destrava a conta", () => {
  /*
    O bloqueio por tentativas seguidas é conferido ANTES da comparação da
    senha. Sem zerar o contador, a conta bloqueada continuava recusando o
    acesso mesmo com a senha nova — e este é justamente o caminho que a pessoa
    toma depois de errar cinco vezes: pedir uma senha nova. Ela recebia a senha
    e ainda assim não entrava, sem nada na tela explicando por quê.
  */

  it("a conta bloqueada volta a aceitar login depois da redefinição", async () => {
    const pessoa = await criarFuncionario();

    for (let i = 0; i < MAX_POR_CONTA; i += 1) {
      await registrarFalha(pessoa.username, "");
    }
    assert.equal(
      await passaNaBarreira(pessoa.username),
      false,
      "a conta deveria estar bloqueada antes da redefinição"
    );

    const token = `token-de-teste-${pessoa.id}`;
    await pedidoPendente(pessoa.id, token);

    const dados = new FormData();
    dados.set("password", "NovaSenha@456");
    dados.set("confirmPassword", "NovaSenha@456");

    const resultado = await resetPassword(token, dados);
    assert.equal(resultado.ok, true);

    assert.equal(
      await passaNaBarreira(pessoa.username),
      true,
      "depois de redefinir, o login precisa passar"
    );
  });

  it("o contador e o prazo de bloqueio ficam limpos no banco", async () => {
    const pessoa = await criarFuncionario();

    for (let i = 0; i < MAX_POR_CONTA; i += 1) {
      await registrarFalha(pessoa.username, "");
    }

    const token = `token-limpeza-${pessoa.id}`;
    await pedidoPendente(pessoa.id, token);

    const dados = new FormData();
    dados.set("password", "OutraSenha@789");
    dados.set("confirmPassword", "OutraSenha@789");
    await resetPassword(token, dados);

    const conta = await db.user.findUnique({ where: { id: pessoa.id } });

    assert.equal(conta!.failedAttempts, 0);
    assert.equal(conta!.lockedUntil, null);
    // A pessoa escolheu a própria senha: não faz sentido exigir outra troca.
    assert.equal(conta!.mustChangePassword, false);
    assert.equal(await verifyPassword("OutraSenha@789", conta!.passwordHash), true);
  });

  it("o token só serve uma vez", async () => {
    const pessoa = await criarFuncionario();
    const token = `token-unico-${pessoa.id}`;
    await pedidoPendente(pessoa.id, token);

    const dados = new FormData();
    dados.set("password", "PrimeiraSenha@1");
    dados.set("confirmPassword", "PrimeiraSenha@1");
    assert.equal((await resetPassword(token, dados)).ok, true);

    const denovo = new FormData();
    denovo.set("password", "SegundaSenha@2");
    denovo.set("confirmPassword", "SegundaSenha@2");
    const segunda = await resetPassword(token, denovo);

    assert.equal(segunda.ok, false);

    // E a senha continua sendo a primeira.
    const conta = await db.user.findUnique({ where: { id: pessoa.id } });
    assert.equal(await verifyPassword("PrimeiraSenha@1", conta!.passwordHash), true);
  });
});

describe("Token de redefinição", () => {
  /*
    O banco guardava o token em texto puro. Quem tivesse uma cópia do banco, e o
    `npm run backup` gera cópias, abria o link de qualquer pedido ainda dentro
    da hora de validade e assumia a conta. Agora o banco guarda só o digest.
  */

  it("o pedido feito pela tela grava o digest, nunca o token", async () => {
    const pessoa = await criarFuncionario();
    await db.user.update({
      where: { id: pessoa.id },
      data: { email: `${pessoa.username}@teste.local` },
    });

    const dados = new FormData();
    dados.set("email", `${pessoa.username}@teste.local`);
    assert.equal((await requestPasswordReset(dados)).ok, true);

    const gravado = await db.passwordResetToken.findFirst({ where: { userId: pessoa.id } });
    assert.ok(gravado, "o pedido foi registrado");

    // SHA-256 em hexadecimal, e não o formato do randomUUID que vai no link.
    assert.match(gravado.token, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(gravado.token, /^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("o token em claro gravado no banco não abre o link", async () => {
    /*
      É o caso dos pedidos que estavam pendentes quando esta mudança foi
      publicada: o banco tem o token em claro, a busca agora é pelo digest, e o
      link deixa de valer. Eles duravam uma hora, então o efeito passa sozinho.

      E é também a garantia que importa: ler o valor da coluna não basta mais
      para usar o link.
    */
    const pessoa = await criarFuncionario();
    const token = `token-em-claro-${pessoa.id}`;
    await db.passwordResetToken.create({
      data: { userId: pessoa.id, token, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const resultado = await resetPassword(token, formulario("SenhaNova@2026"));

    assert.equal(resultado.ok, false);
  });
});

describe("Tamanho mínimo da senha", () => {
  it(`${SENHA_MINIMA - 1} caracteres é recusado, e o link continua valendo`, async () => {
    const pessoa = await criarFuncionario();
    const token = `token-curta-${pessoa.id}`;
    await pedidoPendente(pessoa.id, token);

    const curta = "A".repeat(SENHA_MINIMA - 1);
    const recusa = await resetPassword(token, formulario(curta));

    assert.deepEqual(recusa, { ok: false, error: AVISO_SENHA_CURTA });

    /*
      A validação vem ANTES de usar o token. Se fosse o contrário, errar o
      tamanho da senha gastaria o link, e a pessoa teria de pedir outro por
      causa de um erro de digitação.
    */
    const pedido = await db.passwordResetToken.findUnique({
      where: { token: digestDoToken(token) },
    });
    assert.equal(pedido?.usedAt, null, "o link não foi gasto");

    const certa = "A".repeat(SENHA_MINIMA);
    assert.equal((await resetPassword(token, formulario(certa))).ok, true);
  });
});
