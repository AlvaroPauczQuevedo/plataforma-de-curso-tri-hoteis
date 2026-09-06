import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  checksumDe,
  comandosDe,
  ehObjetoJaExistente,
} from "../src/lib/sql-de-migracao";

/**
 * O corte do arquivo de migração em comandos.
 *
 * Isto existe porque o `prisma migrate deploy` não roda na hospedagem — o
 * motor de migração não consegue o lock do SQLite durante a publicação — e a
 * aplicação passou a executar as migrações pelo cliente do Prisma, um comando
 * por chamada.
 *
 * Trocar "o Prisma executa o arquivo" por "nós cortamos e executamos" é assumir
 * uma responsabilidade que antes não era nossa, e um corte errado produz um
 * schema silenciosamente diferente do pretendido. Por isso o teste principal
 * não confere o número de pedaços nem o texto deles: confere o RESULTADO,
 * contra a única referência que importa — executar o arquivo inteiro de uma vez.
 */

const PASTA = path.join(process.cwd(), "prisma", "migrations");

function migracoes(): string[] {
  return readdirSync(PASTA, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d/.test(d.name))
    .map((d) => d.name)
    .sort();
}

/**
 * A forma do banco: tabelas, índices e o SQL que os criou.
 *
 * As quebras de linha são normalizadas antes de comparar. Os arquivos de
 * migração estão em CRLF, e o corte em comandos devolve LF — então o DDL que o
 * SQLite guarda em `sqlite_master` sai com quebras diferentes pelos dois
 * caminhos, sem que nada de estrutural mude. Comparar cru acusaria uma
 * diferença que não existe; é o texto do DDL que varia, não o schema.
 */
function schemaDe(db: DatabaseSync): string {
  const linhas = db
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )
    .all();
  return JSON.stringify(linhas, null, 2).split("\\r\\n").join("\\n");
}

describe("O corte do SQL de migração", () => {
  it("produz o mesmo schema que executar o arquivo inteiro", () => {
    const nomes = migracoes();
    assert.ok(nomes.length > 0, "nenhuma migração encontrada para conferir");

    const inteiro = new DatabaseSync(":memory:");
    const emPedacos = new DatabaseSync(":memory:");

    for (const nome of nomes) {
      const sql = readFileSync(path.join(PASTA, nome, "migration.sql"), "utf8");

      inteiro.exec(sql);

      const comandos = comandosDe(sql);
      assert.ok(comandos.length > 0, `${nome} não produziu comando nenhum`);
      for (const comando of comandos) emPedacos.exec(comando);

      // Compara a cada passo: assim a falha aponta a migração culpada, em vez
      // de só dizer que o resultado final divergiu.
      assert.equal(
        schemaDe(emPedacos),
        schemaDe(inteiro),
        `o schema divergiu depois de ${nome}`
      );
    }

    inteiro.close();
    emPedacos.close();
  });

  it("não corta no ponto e vírgula dentro de texto", () => {
    const sql =
      "INSERT INTO \"T\" (\"a\") VALUES ('um; dois');\n" + 'CREATE TABLE "U" ("b" TEXT);';
    assert.deepEqual(comandosDe(sql), [
      "INSERT INTO \"T\" (\"a\") VALUES ('um; dois')",
      'CREATE TABLE "U" ("b" TEXT)',
    ]);
  });

  it("entende apóstrofo dobrado como apóstrofo literal", () => {
    // Sem a regra, o `''` alternaria o estado duas vezes e o `;` seguinte
    // seria lido como fim de comando estando dentro do texto.
    const sql = "INSERT INTO \"T\" (\"a\") VALUES ('d''agua; ainda dentro');";
    assert.deepEqual(comandosDe(sql), [
      "INSERT INTO \"T\" (\"a\") VALUES ('d''agua; ainda dentro')",
    ]);
  });

  it("descarta linhas de comentário", () => {
    const sql = '-- CreateTable\nCREATE TABLE "T" ("a" TEXT);';
    assert.deepEqual(comandosDe(sql), ['CREATE TABLE "T" ("a" TEXT)']);
  });

  it("reconhece só os erros de objeto já existente", () => {
    // Mensagens reais do SQLite, como chegam pelo cliente do Prisma.
    assert.ok(ehObjetoJaExistente("duplicate column name: validadeMeses"));
    assert.ok(ehObjetoJaExistente('table "ConclusaoExterna" already exists'));
    assert.ok(ehObjetoJaExistente('index "User_unidadeId_idx" already exists'));

    // O resto tem de continuar interrompendo: nesses casos o banco NÃO está
    // onde a migração queria, e seguir esconderia o problema.
    assert.equal(ehObjetoJaExistente("no such table: User"), false);
    assert.equal(ehObjetoJaExistente("UNIQUE constraint failed: User.username"), false);
    assert.equal(ehObjetoJaExistente('near "CRETE": syntax error'), false);
    assert.equal(ehObjetoJaExistente("database is locked"), false);
  });

  it("reconcilia um banco em desvio, como o da produção em 2026-09-06", () => {
    /*
      O estado real: tudo aplicado até `departamentos_adicionais`, mais a coluna
      `validadeMeses` já presente sem que a migração que a cria constasse como
      aplicada. O aplicador parava ali e as três migrações seguintes nunca
      rodavam — inclusive a que cria `User.unidadeId`, sem a qual o login
      inteiro falha.
    */
    const nomes = migracoes();
    const corte = nomes.findIndex((n) => n.includes("whatsapp_e_reciclagem"));
    assert.ok(corte > 0, "migração de referência não encontrada");

    const db = new DatabaseSync(":memory:");
    for (const nome of nomes.slice(0, corte)) {
      db.exec(readFileSync(path.join(PASTA, nome, "migration.sql"), "utf8"));
    }
    // O desvio: a coluna já lá, a migração não registrada.
    db.exec('ALTER TABLE "CursoObrigatorio" ADD COLUMN "validadeMeses" INTEGER');

    const ignorados: string[] = [];
    for (const nome of nomes.slice(corte)) {
      for (const comando of comandosDe(
        readFileSync(path.join(PASTA, nome, "migration.sql"), "utf8")
      )) {
        try {
          db.exec(comando);
        } catch (erro) {
          const texto = (erro as Error).message;
          if (!ehObjetoJaExistente(texto)) {
            throw new Error(`${nome} parou em: ${texto}`);
          }
          ignorados.push(texto);
        }
      }
    }

    // Pulou exatamente o que já existia — nem mais, nem menos.
    assert.equal(ignorados.length, 1);
    assert.match(ignorados[0], /duplicate column name: validadeMeses/);

    // E o schema chegou onde precisava: sem estas, o login não funciona.
    const colunas = db
      .prepare('PRAGMA table_info("User")')
      .all()
      .map((c) => (c as { name: string }).name);
    assert.ok(colunas.includes("unidadeId"), "User.unidadeId não foi criada");
    assert.ok(colunas.includes("telefone"), "User.telefone não foi criada");

    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => (t as { name: string }).name);
    assert.ok(tabelas.includes("ConclusaoExterna"));
    assert.ok(tabelas.includes("Unidade"));

    db.close();
  });

  it("usa o mesmo checksum que o Prisma grava", () => {
    // SHA-256 do conteúdo, em hexadecimal. Precisa bater exatamente, senão o
    // `prisma migrate` seguinte acusa migração alterada depois de aplicada.
    assert.equal(
      checksumDe("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
