/**
 * Backup do banco e dos arquivos enviados.
 *
 * Os dois precisam ser copiados JUNTOS: o banco guarda apenas o id e o caminho
 * de cada arquivo, então um sem o outro não reconstrói as aulas — o banco
 * apontaria para vídeos que não existem, ou os vídeos ficariam órfãos.
 *
 * O banco é copiado com `VACUUM INTO`, e não com uma cópia de arquivo: o
 * SQLite pode estar no meio de uma escrita, e copiar o arquivo cru produziria
 * um backup corrompido justamente quando ele é necessário. O `VACUUM INTO`
 * gera um snapshot consistente mesmo com a plataforma no ar.
 *
 * Rodando diariamente por cron, o disco encheria em poucos meses. Por isso o
 * script apaga sozinho os backups mais antigos, mantendo os BACKUP_KEEP mais
 * recentes (padrão 14). Só remove pastas com o formato de carimbo que ele
 * mesmo cria — nunca toca em nada que não tenha gerado.
 *
 * Uso: npx tsx prisma/backup.ts [destino]
 *
 * Sem argumento, grava em BACKUP_DIR ou em ./backups.
 */
import { PrismaClient } from "@prisma/client";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const db = new PrismaClient();

/** Caminho do arquivo SQLite a partir de DATABASE_URL. */
function caminhoDoBanco(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!url.startsWith("file:")) {
    throw new Error(
      `Este script faz backup de SQLite. DATABASE_URL aponta para outro banco: ${url.split(":")[0]}`
    );
  }
  const bruto = url.slice("file:".length);
  // Prisma resolve caminhos relativos a partir da pasta do schema.
  return path.isAbsolute(bruto) ? bruto : path.resolve(process.cwd(), "prisma", bruto);
}

function caminhoDosUploads(): string {
  return path.resolve(
    process.env.STORAGE_DIR || path.join(process.cwd(), "storage", "uploads")
  );
}

/** Soma recursiva do tamanho de uma pasta, para o relatório final. */
async function tamanhoDe(dir: string): Promise<number> {
  let total = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, item.name);
    total += item.isDirectory() ? await tamanhoDe(completo) : (await stat(completo)).size;
  }
  return total;
}

const emMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Nome de pasta que este script gera: 20260830-011500 */
const CARIMBO = /^\d{8}-\d{6}$/;

/**
 * Apaga os backups além dos `manter` mais recentes.
 *
 * A remoção acontece DEPOIS de o novo backup estar gravado, nunca antes: se
 * o disco estiver cheio e a gravação falhar, é melhor terminar com os backups
 * antigos intactos do que com nenhum.
 */
async function limparAntigos(raiz: string, manter: number): Promise<string[]> {
  const pastas = (await readdir(raiz, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && CARIMBO.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

  const remover = pastas.slice(manter);
  for (const nome of remover) {
    await rm(path.join(raiz, nome), { recursive: true, force: true });
  }
  return remover;
}

async function main() {
  const banco = caminhoDoBanco();
  const uploads = caminhoDosUploads();

  if (!existsSync(banco)) {
    throw new Error(`Banco não encontrado em ${banco}. Confira DATABASE_URL.`);
  }

  const carimbo = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);

  const raiz = path.resolve(
    process.argv[2] || process.env.BACKUP_DIR || path.join(process.cwd(), "backups")
  );
  const destino = path.join(raiz, carimbo);
  await mkdir(destino, { recursive: true });

  // O SQLite espera barras normais no caminho, inclusive no Windows.
  const destinoBanco = path.join(destino, "dev.db").split(path.sep).join("/");
  await db.$executeRawUnsafe(`VACUUM INTO '${destinoBanco}'`);
  const tamanhoBanco = (await stat(destinoBanco)).size;

  let tamanhoUploads = 0;
  if (existsSync(uploads)) {
    await cp(uploads, path.join(destino, "uploads"), { recursive: true });
    tamanhoUploads = await tamanhoDe(path.join(destino, "uploads"));
  }

  console.log("\nBackup concluído.\n");
  console.log(`  Destino:  ${destino}`);
  console.log(`  Banco:    ${emMB(tamanhoBanco)}  (de ${banco})`);
  if (tamanhoUploads > 0) {
    console.log(`  Arquivos: ${emMB(tamanhoUploads)}  (de ${uploads})`);
  } else {
    console.log(`  Arquivos: nenhum encontrado em ${uploads}`);
  }
  const manter = Number(process.env.BACKUP_KEEP ?? 14);
  const removidos = await limparAntigos(raiz, manter);
  if (removidos.length > 0) {
    console.log(`  Removidos: ${removidos.length} backup(s) além dos ${manter} mais recentes`);
  }

  console.log("");
  console.log("  Para restaurar: pare a plataforma, coloque dev.db no caminho de");
  console.log("  DATABASE_URL e a pasta uploads no caminho de STORAGE_DIR.\n");
}

main()
  .catch((erro) => {
    console.error(`\nFalha no backup: ${(erro as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
