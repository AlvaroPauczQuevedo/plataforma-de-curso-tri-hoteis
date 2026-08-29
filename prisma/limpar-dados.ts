/**
 * Limpa os dados de demonstração deixando a plataforma pronta para uso real.
 *
 * REMOVE: funcionários, cursos, módulos, aulas, arquivos enviados,
 *         matrículas, progresso, certificados e todos os registros de log.
 * MANTÉM: a conta de administrador (para não perder o acesso),
 *         os departamentos e as categorias (estrutura de apoio).
 *
 * Uso: npx tsx prisma/limpar-dados.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const db = new PrismaClient();

const ADMIN_EMAIL = "admin@trihoteis.com.br";
/** Mesmo caminho usado por src/lib/storage.ts (respeita STORAGE_DIR). */
const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_DIR || path.join(process.cwd(), "storage", "uploads")
);
/** Vídeo base usado pelo seed de demonstração — preservado. */
const ARQUIVOS_PRESERVADOS = new Set(["seed-flower.mp4", ".gitkeep"]);

async function limparPasta(subpasta: string) {
  const dir = path.join(STORAGE_ROOT, subpasta);
  let removidos = 0;
  try {
    for (const nome of await fs.readdir(dir)) {
      if (ARQUIVOS_PRESERVADOS.has(nome)) continue;
      await fs.unlink(path.join(dir, nome));
      removidos++;
    }
  } catch {
    // pasta pode não existir ainda
  }
  return removidos;
}

async function main() {
  const admin = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    throw new Error(
      `Administrador ${ADMIN_EMAIL} não encontrado. Limpeza abortada para não deixar a plataforma sem acesso.`
    );
  }

  console.log("Removendo dados de demonstração...");

  await db.$transaction([
    db.adminActivityLog.deleteMany(),
    db.accessLog.deleteMany(),
    db.certificate.deleteMany(),
    db.courseProgress.deleteMany(),
    db.lessonProgress.deleteMany(),
    db.enrollment.deleteMany(),
    db.lesson.deleteMany(),
    db.module.deleteMany(),
    db.course.deleteMany(),
    db.passwordResetToken.deleteMany(),
    // todos os usuários, exceto o administrador
    db.user.deleteMany({ where: { NOT: { id: admin.id } } }),
    db.fileAsset.deleteMany(),
  ]);

  const videos = await limparPasta("videos");
  const pdfs = await limparPasta("pdfs");
  const capas = await limparPasta("covers");
  const avatares = await limparPasta("avatars");

  const [usuarios, cursos, matriculas, departamentos, categorias] = await Promise.all([
    db.user.count(),
    db.course.count(),
    db.enrollment.count(),
    db.department.count(),
    db.category.count(),
  ]);

  console.log("\nLimpeza concluída.\n");
  console.log(`  Arquivos removidos: ${videos} vídeo(s), ${pdfs} PDF(s), ${capas} capa(s), ${avatares} avatar(es)`);
  console.log(`  Usuários restantes: ${usuarios} (apenas o administrador)`);
  console.log(`  Cursos: ${cursos} | Matrículas: ${matriculas}`);
  console.log(`  Preservados: ${departamentos} departamento(s), ${categorias} categoria(s)\n`);
  console.log(`  Acesso administrativo: ${ADMIN_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
