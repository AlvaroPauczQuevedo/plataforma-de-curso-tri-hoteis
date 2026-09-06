/**
 * Confere se um backup restaura de verdade.
 *
 * O `backup.mjs` existe há tempos e roda sem reclamar. Restaurar, porém, nunca
 * tinha sido testado — estava descrito em prosa no README e nada mais. Backup
 * que ninguém restaurou não é backup, é esperança: a hora de descobrir que o
 * arquivo está truncado, ou que faltam os vídeos, não pode ser a hora em que
 * ele é necessário.
 *
 * Este script restaura para uma pasta TEMPORÁRIA e confere lá. Ele nunca
 * escreve no banco de produção nem na pasta de uploads em uso — e recusa rodar
 * se o destino coincidir com qualquer um dos dois.
 *
 * O que ele verifica, em ordem de importância:
 *
 *  1. **Integridade do SQLite** (`PRAGMA integrity_check`). Pega corrupção e
 *     truncamento, que é o que uma cópia interrompida produz.
 *  2. **Os arquivos batem com o banco.** Cada linha de `FileAsset` aponta para
 *     um arquivo; se ele não veio no backup, a aula existe e o vídeo não abre.
 *     É a falha que o próprio backup avisa ser possível — banco e uploads
 *     precisam viajar juntos — e a que ninguém percebe sem conferir.
 *  3. **O schema é o que o código espera**, comparando `_prisma_migrations`
 *     com as pastas de `prisma/migrations`. Backup antigo restaura, sobe, e
 *     quebra nas telas novas.
 *  4. **Há dado onde deveria haver.** Um banco íntegro e vazio passa nas três
 *     conferências acima e não serve para nada.
 *
 * JavaScript puro, sem `tsx`, pelo mesmo motivo do backup: em produção a
 * aplicação roda no build `standalone`, cujo `node_modules` não traz `tsx`. Um
 * verificador que só roda na máquina de quem desenvolve não verifica nada.
 *
 * Uso:
 *   node scripts/restaurar-backup.mjs                 # o backup mais recente
 *   node scripts/restaurar-backup.mjs caminho/do/backup
 */
import { PrismaClient } from "@prisma/client";
import { cp, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Nome de pasta que o backup gera: 20260830-011500 */
const CARIMBO = /^\d{8}-\d{6}$/;

function caminhoDoBancoEmUso() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!url.startsWith("file:")) return null;
  const bruto = url.slice("file:".length);
  return path.isAbsolute(bruto) ? bruto : path.resolve(process.cwd(), "prisma", bruto);
}

function caminhoDosUploadsEmUso() {
  return path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage", "uploads"));
}

/** O backup mais recente dentro da raiz configurada. */
async function backupMaisRecente() {
  const raiz = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
  if (!existsSync(raiz)) {
    throw new Error(
      `Nenhuma pasta de backups em ${raiz}. Rode \`npm run backup\` antes, ou informe o caminho.`
    );
  }

  const pastas = (await readdir(raiz, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && CARIMBO.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

  if (pastas.length === 0) {
    throw new Error(`Nenhum backup encontrado em ${raiz}.`);
  }
  return path.join(raiz, pastas[0]);
}

const conferencias = [];
function conferir(descricao, ok, detalhe = "") {
  conferencias.push({ descricao, ok });
  console.log(`  ${ok ? "ok   " : "FALHA"} ${descricao}${detalhe ? `  — ${detalhe}` : ""}`);
}

/**
 * Imprime o veredito e define o código de saída.
 *
 * É função, e não código solto no fim de `main`, porque o caminho do banco
 * corrompido termina antes — e um verificador que sai com código 0 depois de
 * reprovar o backup é pior do que verificador nenhum: o cron não reclamaria.
 */
function resumir() {
  const falhas = conferencias.filter((c) => !c.ok);
  console.log("");

  if (falhas.length === 0) {
    console.log(`Backup restaurado e conferido: ${conferencias.length} verificação(ões), nenhuma falha.`);
    console.log("");
    return;
  }

  console.log(`${falhas.length} verificação(ões) FALHARAM:`);
  for (const f of falhas) console.log(`  ✗ ${f.descricao}`);
  console.log("");
  console.log("Este backup NÃO serve para restaurar. Descubra o motivo antes de precisar dele.");
  console.log("");
  process.exitCode = 1;
}

async function main() {
  const origem = path.resolve(process.argv[2] || (await backupMaisRecente()));

  console.log("");
  console.log(`Backup: ${origem}`);

  const bancoDoBackup = path.join(origem, "dev.db");
  const uploadsDoBackup = path.join(origem, "uploads");

  if (!existsSync(bancoDoBackup)) {
    throw new Error(`Não há dev.db em ${origem}. Este caminho é mesmo um backup?`);
  }

  /*
    Trava de segurança. Este script existe para dar confiança, e um verificador
    capaz de escrever por cima da produção faria o contrário disso.
  */
  const bancoEmUso = caminhoDoBancoEmUso();
  if (bancoEmUso && path.resolve(bancoDoBackup) === path.resolve(bancoEmUso)) {
    throw new Error("O backup apontado É o banco em uso. Recusando por segurança.");
  }

  // Mesma razão para os arquivos: apontar o backup para a pasta viva faria a
  // conferência ler produção e, pior, dar um "tudo certo" que não prova nada
  // sobre o backup.
  const uploadsEmUso = caminhoDosUploadsEmUso();
  if (path.resolve(uploadsDoBackup) === uploadsEmUso) {
    throw new Error("A pasta de uploads apontada É a que está em uso. Recusando por segurança.");
  }

  const pasta = await mkdtemp(path.join(tmpdir(), "academia-restauro-"));
  const bancoRestaurado = path.join(pasta, "dev.db");
  const uploadsRestaurados = path.join(pasta, "uploads");

  console.log(`Restaurando em: ${pasta}`);
  console.log("");

  await cp(bancoDoBackup, bancoRestaurado);
  const temUploads = existsSync(uploadsDoBackup);
  if (temUploads) await cp(uploadsDoBackup, uploadsRestaurados, { recursive: true });

  const db = new PrismaClient({
    datasources: { db: { url: `file:${bancoRestaurado}` } },
  });

  try {
    /*
      1. Integridade.

      Em try/catch porque um arquivo suficientemente quebrado não devolve
      "not ok" — ele nem abre, e o erro do SQLite chega vazio. Deixar essa
      exceção subir encerrava o script com uma linha em branco, que é a pior
      resposta possível para "meu backup presta?". Aqui vira uma conferência
      reprovada, com o motivo, e as demais ainda tentam rodar.
    */
    let integro = false;
    try {
      const integridade = await db.$queryRawUnsafe("PRAGMA integrity_check");
      const resultado = Object.values(integridade[0] ?? {})[0];
      integro = resultado === "ok";
      conferir("o arquivo SQLite está íntegro", integro, String(resultado));
    } catch (erro) {
      const motivo = String(erro?.message ?? erro).split("\n")[0].trim();
      conferir(
        "o arquivo SQLite está íntegro",
        false,
        motivo || "o arquivo não abre como banco de dados (truncado ou corrompido)"
      );
    }

    if (!integro) {
      console.log("");
      console.log("  O banco não abre. As demais conferências não têm o que examinar —");
      console.log("  este arquivo não restaura de jeito nenhum.");
      resumir();
      return;
    }

    // 2. Dado onde deveria haver ------------------------------------------
    const [usuarios, cursos, certificados, arquivos] = await Promise.all([
      db.user.count(),
      db.course.count(),
      db.certificate.count(),
      db.fileAsset.count(),
    ]);

    conferir("há contas no backup", usuarios > 0, `${usuarios} usuário(s)`);
    conferir("há cursos no backup", cursos > 0, `${cursos} curso(s)`);
    console.log(`  ...   ${certificados} certificado(s), ${arquivos} arquivo(s) registrado(s)`);

    // 3. Banco e arquivos vieram juntos -----------------------------------
    if (arquivos === 0) {
      conferir("os arquivos batem com o banco", true, "nenhum arquivo registrado");
    } else if (!temUploads) {
      conferir(
        "os arquivos batem com o banco",
        false,
        `o banco cita ${arquivos} arquivo(s) e o backup não tem pasta uploads`
      );
    } else {
      /*
        `storagePath` é gravado em relação à pasta de uploads. Conferimos cada
        um contra a cópia restaurada: banco e arquivos precisam viajar juntos,
        e é justamente esta a falha que passa despercebida — a plataforma sobe,
        as telas abrem, e só quem clica no vídeo descobre.
      */
      const registros = await db.fileAsset.findMany({
        select: { storagePath: true, filename: true, size: true },
      });

      const faltando = [];
      let tamanhoDivergente = 0;

      for (const r of registros) {
        const relativo = r.storagePath.split(/[\\/]/).filter(Boolean);
        const completo = path.join(uploadsRestaurados, ...relativo);
        if (!existsSync(completo)) {
          faltando.push(r.filename);
          continue;
        }
        const tamanho = (await stat(completo)).size;
        if (r.size > 0 && tamanho !== r.size) tamanhoDivergente += 1;
      }

      conferir(
        "todo arquivo citado pelo banco veio no backup",
        faltando.length === 0,
        faltando.length > 0
          ? `${faltando.length} faltando: ${faltando.slice(0, 3).join(", ")}${faltando.length > 3 ? "..." : ""}`
          : `${registros.length} conferido(s)`
      );

      conferir(
        "os tamanhos batem com o registro",
        tamanhoDivergente === 0,
        tamanhoDivergente > 0 ? `${tamanhoDivergente} divergente(s)` : ""
      );
    }

    // 4. Schema compatível com o código ------------------------------------
    const aplicadas = await db.$queryRawUnsafe(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    const jaAplicadas = new Set(aplicadas.map((l) => l.migration_name));
    const noRepositorio = (
      await readdir(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
    )
      .filter((d) => d.isDirectory() && /^\d/.test(d.name))
      .map((d) => d.name);

    const faltantes = noRepositorio.filter((n) => !jaAplicadas.has(n));

    conferir(
      "o schema do backup é o que o código espera",
      faltantes.length === 0,
      faltantes.length > 0
        ? `${faltantes.length} migração(ões) a aplicar: ${faltantes.join(", ")}`
        : `${noRepositorio.length} migração(ões)`
    );

    if (faltantes.length > 0) {
      console.log("");
      console.log("  Um backup mais antigo que o código restaura, mas as telas novas");
      console.log("  quebram até `prisma migrate deploy` rodar sobre ele. Não é defeito");
      console.log("  do backup — é um passo a mais na restauração.");
    }
  } finally {
    await db.$disconnect();
  }

  // ------------------------------------------------------------- faxina
  const manter = process.argv.includes("--manter");
  if (manter) {
    console.log("");
    console.log(`Cópia restaurada mantida em ${pasta}`);
    console.log("Para usá-la: aponte DATABASE_URL e STORAGE_DIR para lá.");
  } else {
    await rm(pasta, { recursive: true, force: true });
  }

  resumir();
}

main().catch((erro) => {
  console.error(`\nFalha ao conferir o backup: ${erro.message}\n`);
  process.exitCode = 1;
});
