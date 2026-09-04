/**
 * Cria a conta de proprietário da plataforma.
 *
 * O proprietário é um administrador com duas particularidades:
 *
 *   - nenhum outro administrador pode editá-lo, desativá-lo ou redefinir a
 *     senha dele — só o próprio titular;
 *   - ele é o único isento da regra de departamento, ou seja, alcança todos
 *     os usuários da plataforma.
 *
 * A senha é sorteada aqui com `randomInt` do node:crypto e impressa UMA única
 * vez, neste terminal. Não fica salva em lugar nenhum em texto puro e não há
 * como recuperá-la depois — se perder, rode `definir-proprietario.ts` ou
 * redefina pelo painel com outra conta de administrador.
 *
 * Roda por linha de comando de propósito. Fosse um botão na interface,
 * qualquer administrador poderia se autopromover e a proteção não valeria
 * nada. Quem tem acesso ao servidor já tem acesso ao banco de qualquer forma.
 *
 * Uso:
 *   npx tsx prisma/criar-proprietario.ts <nome-de-usuario> "<Nome Completo>"
 */
import { PrismaClient } from "@prisma/client";
import { motivoDeNomeInvalido, normalizarNomeDeUsuario } from "../src/lib/nome-de-usuario";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function senhaInicial(): string {
  // Sem I, O, 0 e 1: a senha vai ser lida em voz alta ou copiada à mão.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloco = () =>
    Array.from({ length: 4 }, () => alfabeto[randomInt(alfabeto.length)]).join("");
  return `${bloco()}-${bloco()}-${bloco()}-${bloco()}`;
}

async function main() {
  const username = normalizarNomeDeUsuario(process.argv[2] ?? "");
  const nome = process.argv[3]?.trim();

  if (!username || !nome) {
    console.error("\nInforme o nome de usuário e o nome completo.");
    console.error('  npx tsx prisma/criar-proprietario.ts fulano.tal "Fulano de Tal"\n');
    process.exitCode = 1;
    return;
  }

  const motivo = motivoDeNomeInvalido(username);
  if (motivo) {
    console.error(`\n${motivo}\n`);
    process.exitCode = 1;
    return;
  }

  const jaExiste = await db.user.findUnique({ where: { username } });
  if (jaExiste) {
    console.error(`\nJá existe uma conta com o usuário ${username}.`);
    console.error("Para proteger uma conta que já existe, use:");
    console.error(`  npx tsx prisma/definir-proprietario.ts ${username}\n`);
    process.exitCode = 1;
    return;
  }

  const senha = senhaInicial();
  const conta = await db.user.create({
    data: {
      name: nome,
      username,
      passwordHash: await bcrypt.hash(senha, 10),
      role: "ADMIN",
      active: true,
      protegido: true,
    },
  });

  const linha = "=".repeat(72);
  console.log("");
  console.log(linha);
  console.log(" PROPRIETÁRIO CRIADO");
  console.log(linha);
  console.log("");
  console.log(`  Nome:   ${conta.name}`);
  console.log(`  Usuário: ${conta.username}`);
  console.log(`  Senha:  ${senha}`);
  console.log("");
  console.log("  Esta senha aparece UMA única vez. Anote agora.");
  console.log("  Entre no painel e troque em Perfil antes de qualquer outra coisa.");
  console.log("");
  console.log(linha);
  console.log("");
  console.log(" O que esta conta pode:");
  console.log("   - alterar qualquer usuário, de qualquer departamento;");
  console.log("   - definir o departamento dos demais administradores.");
  console.log("");
  console.log(" O que ninguém pode fazer com ela:");
  console.log("   - editar, desativar ou redefinir a senha desta conta.");
  console.log("     Nem outro administrador, nem outro proprietário.");
  console.log("");
  console.log(" O risco que isso traz: se você perder o acesso a esta conta,");
  console.log(" nenhum colega consegue destravar pela interface. A recuperação");
  console.log(" só é possível aqui pelo servidor.");
  console.log("");

  const protegidas = await db.user.findMany({
    where: { protegido: true },
    select: { username: true },
    orderBy: { username: "asc" },
  });
  console.log(` Contas protegidas agora: ${protegidas.length}`);
  for (const p of protegidas) console.log(`   ${p.username}`);
  console.log("");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
