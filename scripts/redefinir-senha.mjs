/**
 * Redefine a senha de uma conta pela linha de comando.
 *
 * É a saída de emergência da plataforma, e existe por um motivo específico:
 * a conta protegida ("proprietário") só pode ser alterada pelo próprio titular
 * — nem outro proprietário a alcança (ver `lib/permissoes-usuario`). Com o
 * login por nome de usuário e a maior parte da rede sem e-mail cadastrado,
 * `/esqueci-senha` não vale para ela. Sem este script, o dono que esquecesse a
 * senha ficaria trancado do lado de fora, e a única saída seria editar o
 * SQLite à mão gerando um hash bcrypt por fora.
 *
 * Roda no servidor de propósito, e não como botão na interface: quem alcança o
 * disco da aplicação já pode tudo de qualquer forma, então esta é a autoridade
 * certa para "o dono perdeu a senha" — e não uma porta nova.
 *
 * A senha é sorteada, impressa UMA vez e marcada para troca no primeiro
 * acesso. Não fica em lugar nenhum em texto puro.
 *
 * Uso:
 *   npm run senha:redefinir -- maria.silva
 *   npm run senha:redefinir -- --listar-admins
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { senhaProvisoria } from "../src/lib/password.ts";
import { normalizarNomeDeUsuario } from "../src/lib/nome-de-usuario.ts";

const db = new PrismaClient();

/** Sai avisando, sem deixar o processo pendurado numa conexão aberta. */
async function encerrar(codigo, mensagem) {
  if (mensagem) console.error(mensagem);
  await db.$disconnect();
  process.exit(codigo);
}

const argumentos = process.argv.slice(2);

if (argumentos.includes("--listar-admins")) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { username: true, name: true, protegido: true, active: true },
    orderBy: { username: "asc" },
  });

  console.log("");
  console.log(" Contas administrativas:");
  console.log("");
  for (const a of admins) {
    const marcas = [a.protegido ? "protegida" : null, a.active ? null : "inativa"]
      .filter(Boolean)
      .join(", ");
    console.log(`   ${a.username.padEnd(24)} ${a.name}${marcas ? `  (${marcas})` : ""}`);
  }
  console.log("");
  await encerrar(0);
}

const alvo = normalizarNomeDeUsuario(argumentos[0] ?? "");

if (!alvo) {
  await encerrar(
    1,
    [
      "",
      "Informe o nome de usuário da conta.",
      "  npm run senha:redefinir -- maria.silva",
      "",
      "Para ver as contas administrativas:",
      "  npm run senha:redefinir -- --listar-admins",
      "",
    ].join("\n")
  );
}

const conta = await db.user.findUnique({ where: { username: alvo } });

if (!conta) {
  // Ajuda a achar quem digitou quase certo, sem despejar a rede inteira.
  const parecidas = await db.user.findMany({
    where: { username: { contains: alvo.split(".")[0] } },
    select: { username: true, name: true },
    take: 10,
    orderBy: { username: "asc" },
  });

  const dica =
    parecidas.length > 0
      ? ["", "Parecidas:", ...parecidas.map((p) => `   ${p.username.padEnd(24)} ${p.name}`)].join("\n")
      : "";

  await encerrar(1, `\nNenhuma conta com o usuário "${alvo}".${dica}\n`);
}

const senha = senhaProvisoria();

await db.user.update({
  where: { id: conta.id },
  data: {
    passwordHash: await bcrypt.hash(senha, 10),
    // Senha gerada por outra pessoa vale só até o primeiro acesso.
    mustChangePassword: true,
    /*
      Destrava também.

      A barreira por tentativas é conferida ANTES da comparação da senha, então
      uma conta bloqueada continuaria recusando o acesso mesmo com a senha
      nova — e este script é exatamente o que se usa depois de alguém errar a
      senha cinco vezes.
    */
    failedAttempts: 0,
    lockedUntil: null,
  },
});

const linha = "=".repeat(64);
console.log("");
console.log(linha);
console.log(" SENHA REDEFINIDA");
console.log(linha);
console.log(`   Conta:   ${conta.name}${conta.protegido ? "  (protegida)" : ""}`);
console.log(`   Usuário: ${conta.username}`);
console.log(`   Senha:   ${senha}`);
console.log("");
console.log(" Anote agora: esta senha não é recuperável e não se repete.");
console.log(" A plataforma vai exigir uma nova no primeiro acesso.");
if (!conta.active) {
  console.log("");
  console.log(" ATENÇÃO: esta conta está INATIVA e o login continuará recusado.");
  console.log(" Reative-a pelo painel antes de entregar a senha.");
}
console.log(linha);
console.log("");

await encerrar(0);
