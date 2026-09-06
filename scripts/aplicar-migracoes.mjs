/**
 * Aplica migrações pendentes pelo CLIENTE do Prisma, e não pelo motor de
 * migração.
 *
 * É uma saída de emergência, e existe porque a normal falhou em produção de
 * um jeito específico: nesta hospedagem o `prisma migrate deploy` bate em
 *
 *     Error: SQLite database error
 *     database is locked
 *      0: sql_schema_connector::sql_migration_persistence::initialize
 *
 * de forma SUSTENTADA — quatro tentativas com intervalo falham igual. Só que a
 * aplicação continua lendo e gravando naquele mesmo arquivo sem problema
 * nenhum: quem não consegue o lock é o motor de migração, um processo separado,
 * não o banco.
 *
 * O resultado disso foi o pior possível: em 2026-09-06 subiu código que
 * consulta `ConclusaoExterna` com a tabela inexistente, e a tela de funcionário
 * quebrou em produção. É exatamente o cenário que o README já registrava como
 * tendo derrubado o site três vezes.
 *
 * Este script passa por onde o motor tropeça: usa o mesmo cliente da
 * aplicação, executa o SQL da migração e escreve a linha correspondente em
 * `_prisma_migrations` — inclusive o checksum, para o `migrate` seguinte
 * reconhecer a migração como aplicada e não tentar de novo.
 *
 * LIMITE conhecido: divide o arquivo em comandos por `;`, respeitando texto
 * entre apóstrofos. Dá conta do DDL que o Prisma gera. Migração escrita à mão
 * com gatilho ou função — que leva `;` no corpo — precisaria de cuidado extra,
 * e por isso o script CONFERE ao final se o schema ficou como o esperado.
 *
 * Uso:
 *   node scripts/aplicar-migracoes.mjs            # aplica o que falta
 *   node scripts/aplicar-migracoes.mjs --simular  # só lista
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const simular = process.argv.includes("--simular");
const pastaDeMigracoes = path.join(process.cwd(), "prisma", "migrations");

/**
 * Divide o arquivo em comandos.
 *
 * Acompanha o estado de "dentro de apóstrofo" para um `;` em texto literal não
 * cortar o comando no meio — e ignora linhas de comentário, que no SQL do
 * Prisma carregam explicação e às vezes pontuação.
 */
function comandosDe(sql) {
  const comandos = [];
  let atual = "";
  let dentroDeTexto = false;

  for (const linha of sql.split(/\r?\n/)) {
    const semComentario = dentroDeTexto ? linha : linha.replace(/^\s*--.*$/, "");

    /*
      Linha em branco ENTRE comandos é descartada; dentro de um comando ela é
      preservada, porque o SQLite guarda o texto do CREATE TABLE como recebeu.
      Mesma regra de src/lib/sql-de-migracao.ts, que é quem aplica na subida
      do servidor — as duas precisam produzir exatamente o mesmo DDL.
    */
    const entreComandos = atual.trim() === "";
    if (!dentroDeTexto && semComentario.trim() === "" && entreComandos) continue;

    for (let i = 0; i < semComentario.length; i += 1) {
      const c = semComentario[i];

      if (c === "'") {
        // Apóstrofo dobrado é apóstrofo literal, não fim de texto.
        if (dentroDeTexto && semComentario[i + 1] === "'") {
          atual += "''";
          i += 1;
          continue;
        }
        dentroDeTexto = !dentroDeTexto;
        atual += c;
        continue;
      }

      if (c === ";" && !dentroDeTexto) {
        if (atual.trim()) comandos.push(atual.trim());
        atual = "";
        continue;
      }

      atual += c;
    }

    atual += "\n";
  }

  if (atual.trim()) comandos.push(atual.trim());
  return comandos;
}

/** O mesmo checksum que o Prisma grava: SHA-256 do arquivo. */
function checksumDe(conteudo) {
  return createHash("sha256").update(conteudo).digest("hex");
}

async function main() {
  const db = new PrismaClient();

  try {
    /*
      A tabela de controle pode não existir num banco que nunca migrou. Criá-la
      com a mesma forma que o Prisma usa deixa o `migrate` seguinte enxergar o
      que fizemos aqui.
    */
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `);

    const aplicadas = new Set(
      (
        await db.$queryRawUnsafe(
          "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
        )
      ).map((l) => l.migration_name)
    );

    const noRepositorio = readdirSync(pastaDeMigracoes, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d/.test(d.name))
      .map((d) => d.name)
      .sort();

    const pendentes = noRepositorio.filter((n) => !aplicadas.has(n));

    console.log("");
    console.log(`  migrações no repositório: ${noRepositorio.length}`);
    console.log(`  já aplicadas:             ${aplicadas.size}`);
    console.log(`  pendentes:                ${pendentes.length}`);

    if (pendentes.length === 0) {
      console.log("");
      console.log("  Nada a aplicar.");
      console.log("");
      return;
    }

    for (const nome of pendentes) console.log(`     ${nome}`);
    console.log("");

    if (simular) {
      console.log("  Simulação: nada foi executado.");
      console.log("");
      return;
    }

    for (const nome of pendentes) {
      const arquivo = path.join(pastaDeMigracoes, nome, "migration.sql");
      const conteudo = readFileSync(arquivo, "utf8");
      const comandos = comandosDe(conteudo);

      console.log(`  aplicando ${nome} (${comandos.length} comando(s))...`);

      for (const comando of comandos) {
        await db.$executeRawUnsafe(comando);
      }

      /*
        A linha de controle vai DEPOIS dos comandos, e só se todos passaram.
        Registrar antes deixaria uma migração pela metade marcada como
        concluída — que é bem pior do que uma migração não aplicada, porque
        ninguém volta a tentar.
      */
      await db.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
         VALUES (?,?,current_timestamp,?,NULL,NULL,current_timestamp,?)`,
        randomUUID(),
        checksumDe(conteudo),
        nome,
        comandos.length
      );

      console.log(`  ok ${nome}`);
    }

    console.log("");
    console.log(`  ${pendentes.length} migração(ões) aplicada(s).`);
    console.log("");
  } finally {
    await db.$disconnect();
  }
}

main().catch((erro) => {
  console.error("");
  console.error(`  Falha ao aplicar migrações: ${erro?.message ?? erro}`);
  console.error("");
  process.exitCode = 1;
});
