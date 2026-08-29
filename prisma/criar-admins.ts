/**
 * Cria contas de administrador da plataforma.
 *
 * Cada área da operação recebe a própria conta, em vez de todos usarem um
 * login compartilhado: assim o histórico de atividades administrativas
 * (AdminActivityLog) mostra quem fez o quê.
 *
 * A senha é sorteada aqui com `randomInt` do node:crypto e impressa UMA única
 * vez — só o hash vai para o banco. O script é idempotente: rodar de novo não
 * recria nem redefine a senha de quem já existe.
 *
 * Uso: npx tsx prisma/criar-admins.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

interface AdminNovo {
  area: string;
  nome: string;
  email: string;
  cargo: string;
}

const ADMINS: AdminNovo[] = [
  {
    area: "Empresas",
    nome: "Administração — Empresas",
    email: "admin.empresas@trihoteis.com.br",
    cargo: "Administrador da plataforma — Empresas",
  },
  {
    area: "Trainees",
    nome: "Administração — Trainees",
    email: "admin.trainees@trihoteis.com.br",
    cargo: "Administrador da plataforma — Trainees",
  },
  {
    area: "Telemarketing",
    nome: "Administração — Telemarketing",
    email: "admin.telemarketing@trihoteis.com.br",
    cargo: "Administrador da plataforma — Telemarketing",
  },
  {
    area: "Financeiro",
    nome: "Administração — Financeiro",
    email: "admin.financeiro@trihoteis.com.br",
    cargo: "Administrador da plataforma — Financeiro",
  },
];

/**
 * Senha inicial legível: três blocos de quatro caracteres sem letras e números
 * ambíguos, para ser ditada sem confusão. Entropia de ~60 bits, suficiente
 * para uma senha de primeiro acesso que será trocada.
 */
function senhaInicial(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloco = () =>
    Array.from({ length: 4 }, () => alfabeto[randomInt(alfabeto.length)]).join("");
  return `${bloco()}-${bloco()}-${bloco()}`;
}

async function main() {
  const criados: Array<AdminNovo & { senha: string }> = [];
  const existentes: string[] = [];

  for (const admin of ADMINS) {
    const email = admin.email.toLowerCase();
    const ja = await db.user.findUnique({ where: { email } });
    if (ja) {
      existentes.push(`${admin.area} (${email})`);
      continue;
    }

    const senha = senhaInicial();
    await db.user.create({
      data: {
        name: admin.nome,
        email,
        passwordHash: await bcrypt.hash(senha, 10),
        role: "ADMIN",
        active: true,
        position: admin.cargo,
      },
    });
    criados.push({ ...admin, senha });
  }

  const linha = "=".repeat(78);
  console.log("");
  console.log(linha);
  console.log(" ADMINISTRADORES DA PLATAFORMA DE CURSOS");
  console.log(linha);

  if (criados.length === 0) {
    console.log(" Nenhuma conta nova. Todas já existiam.");
  } else {
    console.log(" Anote agora: a senha não é recuperável depois.");
    console.log("");
    console.log(
      ` ${"Área".padEnd(15)} ${"E-mail (login)".padEnd(38)} Senha inicial`
    );
    console.log(" " + "-".repeat(76));
    for (const c of criados) {
      console.log(` ${c.area.padEnd(15)} ${c.email.padEnd(38)} ${c.senha}`);
    }
  }

  if (existentes.length > 0) {
    console.log("");
    console.log(" Já existiam (não alterados): " + existentes.join(", "));
  }

  console.log("");
  console.log(" Painel administrativo: /admin/login");
  console.log(" Todas as contas têm acesso administrativo COMPLETO e idêntico.");
  console.log(" Troque estas senhas antes de colocar a plataforma em produção.");
  console.log(linha);
  console.log("");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
