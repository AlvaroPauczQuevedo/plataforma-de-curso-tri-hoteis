/**
 * Marca (ou desmarca) uma conta como protegida — o "proprietário".
 *
 * Uma conta protegida continua sendo administradora e enxerga todos os
 * usuários, mas nenhum outro administrador consegue editá-la, desativá-la,
 * redefinir sua senha ou gerar link de redefinição para ela. Só o próprio
 * titular altera a própria conta.
 *
 * Roda por linha de comando de propósito: fosse um botão na interface,
 * qualquer administrador poderia se autopromover, e a proteção não valeria
 * nada. Quem tem acesso ao servidor já tem acesso ao banco de qualquer forma.
 *
 * Uso:
 *   npx tsx prisma/definir-proprietario.ts <e-mail>
 *   npx tsx prisma/definir-proprietario.ts <e-mail> --remover
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const remover = process.argv.includes("--remover");

  if (!email) {
    console.error("\nInforme o e-mail da conta.");
    console.error("  npx tsx prisma/definir-proprietario.ts admin.empresas@trihoteis.com.br\n");
    process.exitCode = 1;
    return;
  }

  const conta = await db.user.findUnique({ where: { email } });
  if (!conta) {
    console.error(`\nNenhuma conta com o e-mail ${email}.\n`);
    console.error("Contas existentes:");
    for (const u of await db.user.findMany({ orderBy: { email: "asc" } })) {
      console.error(`  ${u.email}  (${u.role})`);
    }
    console.error("");
    process.exitCode = 1;
    return;
  }

  if (conta.role !== "ADMIN" && !remover) {
    console.error(
      `\n${conta.name} não é administrador. Proteger uma conta comum não faz sentido:\n` +
        "a proteção existe para impedir que administradores alterem uns aos outros.\n"
    );
    process.exitCode = 1;
    return;
  }

  await db.user.update({
    where: { id: conta.id },
    data: { protegido: !remover },
  });

  const linha = "=".repeat(72);
  console.log("");
  console.log(linha);
  if (remover) {
    console.log(` PROTEÇÃO REMOVIDA: ${conta.name}`);
    console.log("");
    console.log(" A conta volta ao regime comum e pode ser alterada por qualquer");
    console.log(" administrador.");
  } else {
    console.log(` CONTA PROTEGIDA: ${conta.name}`);
    console.log(` ${conta.email}`);
    console.log("");
    console.log(" Continua enxergando e gerenciando todos os usuários.");
    console.log(" Nenhum outro administrador pode editá-la, desativá-la nem");
    console.log(" redefinir sua senha.");
    console.log("");
    console.log(" Se perder o acesso a ela, a recuperação só é possível pelo");
    console.log(" servidor — nenhum colega consegue destravar pela interface.");
  }
  console.log(linha);
  console.log("");

  const protegidas = await db.user.findMany({
    where: { protegido: true },
    select: { name: true, email: true },
    orderBy: { email: "asc" },
  });
  console.log(` Contas protegidas agora: ${protegidas.length}`);
  for (const p of protegidas) console.log(`   ${p.email}`);
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
