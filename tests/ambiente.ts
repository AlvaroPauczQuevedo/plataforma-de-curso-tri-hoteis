/**
 * Ambiente dos testes.
 *
 * Cada execução cria um banco SQLite próprio em pasta temporária e aplica as
 * migrações reais — as mesmas que rodam em produção. Nada aqui toca o banco de
 * desenvolvimento: um teste que apaga dados de verdade é pior do que nenhum
 * teste.
 *
 * O `DATABASE_URL` é definido ANTES de qualquer import do cliente Prisma,
 * porque ele lê a variável no momento em que o módulo é carregado.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const pasta = mkdtempSync(path.join(tmpdir(), "academia-teste-"));
const arquivoBanco = path.join(pasta, "teste.db");

process.env.DATABASE_URL = `file:${arquivoBanco}`;
// NODE_ENV é somente-leitura nos tipos do Node; a atribuição é intencional
// aqui para que a aplicação não se comporte como produção durante o teste.
(process.env as Record<string, string>).NODE_ENV = "test";
// Valores previsíveis: os testes de bloqueio dependem destes limites.
process.env.MAX_FAILED_ATTEMPTS = "3";
process.env.LOCKOUT_MINUTES = "10";
process.env.LOGIN_IP_LIMIT = "8";
process.env.LOGIN_IP_WINDOW_MINUTES = "5";
process.env.TRUST_PROXY = "false";

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "migrate", "deploy"],
  {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${arquivoBanco}` },
    shell: process.platform === "win32",
  }
);

// Import estático com a URL passada explicitamente: assim o cliente não
// depende de quando a variável de ambiente foi lida.
export const db = new PrismaClient({ datasources: { db: { url: `file:${arquivoBanco}` } } });

export async function encerrar() {
  await db.$disconnect();

  // No Windows o arquivo segue preso por um instante depois do disconnect;
  // algumas tentativas espaçadas resolvem. Se ainda assim não sair, seguimos:
  // é pasta temporária do sistema, e falhar a suíte por causa da faxina seria
  // pior do que deixar alguns megabytes para o sistema operacional limpar.
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    try {
      rmSync(pasta, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolva) => setTimeout(resolva, 100));
    }
  }
}

/* --------------------------- Fábricas de dados --------------------------- */

let contador = 0;
const proximo = () => (contador += 1);

export async function criarFuncionario(
  opcoes: { ativo?: boolean; senha?: string; departmentId?: string } = {}
) {
  const n = proximo();
  return db.user.create({
    data: {
      name: `Funcionário ${n}`,
      email: `func${n}@teste.local`,
      passwordHash: await bcrypt.hash(opcoes.senha ?? "Senha@123", 4),
      role: "EMPLOYEE",
      active: opcoes.ativo ?? true,
      departmentId: opcoes.departmentId ?? null,
    },
  });
}

export async function criarAdministrador() {
  const n = proximo();
  return db.user.create({
    data: {
      name: `Administrador ${n}`,
      email: `admin${n}@teste.local`,
      passwordHash: await bcrypt.hash("Senha@123", 4),
      role: "ADMIN",
      active: true,
    },
  });
}

/** Administrador usado como autor dos cursos criados nos testes. */
let autorCache: { id: string } | null = null;
async function autorPadrao() {
  if (!autorCache) autorCache = await criarAdministrador();
  return autorCache;
}

/**
 * Curso com um módulo e as aulas descritas, na ordem informada.
 * Devolve o curso e as aulas já criadas, para os testes referenciarem.
 */
export async function criarCurso(opcoes: {
  sequencial?: boolean;
  certificado?: boolean;
  limiarVideo?: number;
  aulas: Array<{ tipo: "VIDEO" | "PDF" | "TEXT"; obrigatoria?: boolean }>;
}) {
  const n = proximo();
  // O curso exige um autor; um administrador serve e é reaproveitado.
  const autor = await autorPadrao();
  const curso = await db.course.create({
    data: {
      title: `Curso ${n}`,
      description: "",
      status: "PUBLISHED",
      createdById: autor.id,
      sequential: opcoes.sequencial ?? false,
      certificateEnabled: opcoes.certificado ?? true,
      videoCompletionThreshold: opcoes.limiarVideo ?? 90,
      modules: { create: { title: "Módulo 1", order: 0 } },
    },
    include: { modules: true },
  });

  const moduloId = curso.modules[0]!.id;
  const aulas = [];
  for (const [indice, aula] of opcoes.aulas.entries()) {
    aulas.push(
      await db.lesson.create({
        data: {
          moduleId: moduloId,
          title: `Aula ${indice + 1}`,
          order: indice,
          type: aula.tipo,
          required: aula.obrigatoria ?? true,
          ...(aula.tipo === "VIDEO" ? { videoSource: "UPLOAD" as const } : {}),
        },
      })
    );
  }

  return { curso, aulas };
}

export async function matricular(userId: string, courseId: string) {
  return db.enrollment.create({ data: { userId, courseId } });
}

export async function concluirAula(userId: string, lessonId: string) {
  return db.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, completed: true, completedAt: new Date() },
    update: { completed: true, completedAt: new Date() },
  });
}
