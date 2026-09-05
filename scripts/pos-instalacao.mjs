/**
 * Roda depois de `npm install` — inclusive na publicação.
 *
 * Duas tarefas, com pesos diferentes:
 *
 *  1. `prisma generate`, sempre. Sem o cliente gerado a aplicação nem sobe,
 *     então falhar aqui deve derrubar a instalação: é melhor a publicação
 *     parar do que entregar um site quebrado.
 *
 *  2. `prisma migrate deploy`, em produção. Falhar aqui apenas avisa, bem
 *     alto, e deixa a publicação seguir — recusar trocaria "algumas telas com
 *     erro" por "site inteiro fora do ar", que é pior.
 *
 * Por que a migração mora aqui, e não na subida do servidor:
 *
 * A hospedagem constrói em modo `standalone`. Nesse modo o Next gera o próprio
 * `server.js` e monta um `node_modules` podado, só com o que ele rastreou como
 * necessário em execução — e o CLI do Prisma não é dependência de execução,
 * então não entra. O `scripts/servidor.mjs` também não é chamado: quem sobe o
 * site é o `server.js` gerado. Resultado: qualquer automação colocada na
 * inicialização simplesmente não roda em produção.
 *
 * A instalação de dependências é o oposto disso — acontece antes da poda, com
 * o `node_modules` completo e o CLI do Prisma disponível. É o único ponto do
 * ciclo de publicação em que dá para migrar sem depender de alguém lembrar.
 *
 * Publicar código que espera uma coluna nova sem migrar o banco já derrubou
 * este site três vezes (2026-08-30, digests 4147123379 e 2268569496). O
 * intervalo entre publicar e alguém reclamar é tempo de site quebrado.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Executa um comando do CLI do Prisma. Devolve o código de saída. */
function prisma(...argumentos) {
  const binario = require.resolve("prisma/build/index.js");
  const resultado = spawnSync(process.execPath, [binario, ...argumentos], {
    stdio: "inherit",
    env: process.env,
  });
  return resultado.status ?? 1;
}

// ---------------------------------------------------------------- gerar

if (prisma("generate") !== 0) {
  console.error("\n  `prisma generate` falhou. A aplicação não sobe sem o cliente gerado.\n");
  process.exit(1);
}

// -------------------------------------------------------------- migrar

/*
  Fora de produção a migração não roda sozinha, de propósito: quem desenvolve
  usa `prisma migrate dev`, que cria migração nova quando o schema muda, e um
  `deploy` disparado por `npm install` atropelaria esse fluxo sem aviso.

  MIGRAR_NA_INSTALACAO existe porque nem toda hospedagem define NODE_ENV
  durante a instalação. Definir a variável no painel garante o comportamento
  sem depender de como a plataforma chama o npm.
*/
const producao = process.env.NODE_ENV === "production";
const forcado = /^(1|true|sim)$/i.test(process.env.MIGRAR_NA_INSTALACAO ?? "");

if (!producao && !forcado) {
  console.log("  [migracao] ambiente de desenvolvimento — nada a aplicar.");
  process.exit(0);
}

console.log("  [migracao] aplicando migrações pendentes...");

/*
  Não conferimos DATABASE_URL aqui de propósito. O CLI do Prisma tem sua
  própria resolução — variável de ambiente, `.env`, `prisma.config` — e
  duplicá-la neste script daria falso negativo: pularia a migração num
  ambiente onde o Prisma acharia a URL sozinho. Faltando de verdade, ele diz
  qual variável falta e o aviso abaixo entra em seguida.
*/
/**
 * Espera bloqueante, sem async: este script é sequencial de ponta a ponta.
 */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/*
  Tenta mais de uma vez, e depois CONFERE o resultado por outro caminho.

  O banco é SQLite num arquivo, e durante a publicação a aplicação continua no
  ar segurando esse arquivo. O `migrate deploy` precisa escrever em
  `_prisma_migrations` e esbarra nisso:

      Error: SQLite database error
      database is locked
       0: sql_schema_connector::sql_migration_persistence::initialize

  A repetição cobre a disputa passageira. Mas nesta hospedagem ela NÃO resolve:
  as quatro tentativas falham igual, o que mostra que o lock é sustentado, e
  não um instante de azar. Por isso as tentativas são só a primeira metade —
  `migracoesPendentes()`, logo abaixo, é que diz se aquilo teve consequência.

  Vale insistir mesmo assim: onde a disputa for passageira, desistir de cara
  deixaria o banco desatualizado por azar de um segundo — o cenário que já
  derrubou este site três vezes.
*/
const TENTATIVAS = 4;
const ESPERA_MS = 3000;

let migrou = false;
for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
  if (prisma("migrate", "deploy") === 0) {
    migrou = true;
    break;
  }
  if (tentativa < TENTATIVAS) {
    console.error(
      `  [migracao] tentativa ${tentativa} de ${TENTATIVAS} falhou. ` +
        `Nova tentativa em ${ESPERA_MS / 1000}s...`
    );
    esperar(ESPERA_MS);
  }
}

/**
 * Quais migrações do repositório ainda não constam como aplicadas.
 *
 * Pergunta pelo CLIENTE do Prisma, e não pelo motor de migração. A diferença é
 * o ponto todo desta função: quando dá `database is locked`, quem não consegue
 * o arquivo é o motor de migração — a aplicação continua lendo e escrevendo
 * normalmente. O cliente passa por onde o motor tropeça.
 *
 * Sem isto, um lock deixava o log dizendo "resolva a migração antes de usar a
 * plataforma" mesmo quando não havia nada a aplicar: aviso alarmante e falso,
 * que é o tipo de coisa que ensina a ignorar aviso.
 *
 * Devolve `null` quando nem isso foi possível — aí realmente não se sabe.
 */
async function migracoesPendentes() {
  let cliente;
  try {
    const { PrismaClient } = await import("@prisma/client");
    cliente = new PrismaClient();

    const aplicadas = await cliente.$queryRawUnsafe(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    const jaAplicadas = new Set(aplicadas.map((linha) => linha.migration_name));

    const pasta = fileURLToPath(new URL("../prisma/migrations", import.meta.url));
    return readdirSync(pasta)
      .filter((nome) => /^\d/.test(nome))
      .filter((nome) => !jaAplicadas.has(nome))
      .sort();
  } catch {
    return null;
  } finally {
    await cliente?.$disconnect().catch(() => {});
  }
}

if (migrou) {
  console.log("  [migracao] banco em dia.");
} else {
  console.error(`\n  [migracao] \`prisma migrate deploy\` falhou ${TENTATIVAS} vezes.`);

  const pendentes = await migracoesPendentes();

  if (pendentes === null) {
    console.error("  [migracao] AVISO: não foi possível nem conferir o estado do banco.");
    console.error("  Causa mais comum: DATABASE_URL ausente no ambiente de publicação.");
    console.error("  A publicação segue, mas confira a plataforma antes de usá-la.\n");
  } else if (pendentes.length === 0) {
    console.log("  [migracao] ...mas NÃO HÁ NADA PENDENTE: o banco já está no schema atual.");
    console.log("  A falha foi só disputa pelo arquivo (`database is locked`), sem efeito.");
    console.log("  Nenhuma ação necessária.\n");
    migrou = true; // para efeitos práticos, o banco está em dia
  } else {
    console.error(`  [migracao] AVISO: ${pendentes.length} migração(ões) PENDENTE(S):`);
    for (const nome of pendentes) console.error(`      ${nome}`);
    console.error("  Telas que dependem do schema novo vão apresentar erro.");
    console.error("  Resolva antes de usar a plataforma.\n");
  }
}

// ------------------------------------------------- conteúdo de primeira vez

/*
  Criação única do curso de boas-vindas, quando a variável pede.

  Existe porque esta hospedagem não dá terminal: sem isto, montar as sete aulas
  e as oito questões seria digitação manual no formulário, e a publicação é o
  único momento em que algo nosso roda no servidor com o banco à mão.

  DESLIGADO por padrão. Sem a variável, nada acontece — conteúdo não deve
  aparecer sozinho num sistema que já está em uso.

  Deixar a variável ligada para sempre é inofensivo: o script recusa se já
  houver curso com aquele título, então republicar não duplica nem sobrescreve
  o progresso de quem já fez.

  Falhar aqui NÃO derruba a publicação, pelo mesmo motivo da migração acima:
  trocar "o curso não foi criado" por "site fora do ar" seria péssimo negócio.
*/
const criarCurso = /^(1|true|sim)$/i.test(process.env.CRIAR_CURSO_BOAS_VINDAS ?? "");

if (!criarCurso) {
  /*
    Diz que está desligado em vez de calar.

    Silêncio aqui é indistinguível de "a variável não pegou": quem ligou
    CRIAR_CURSO_BOAS_VINDAS no painel e não vê linha nenhuma no log não tem
    como saber se errou o nome, se o painel não aplicou, ou se o passo nem
    existe nesta versão.
  */
  console.log("  [conteudo] CRIAR_CURSO_BOAS_VINDAS desligada — nada a criar.");
} else {
  console.log("  [conteudo] criando o curso de boas-vindas...");

  /*
    Roda MESMO SE a migração falhou, e isto foi uma correção.

    Antes este trecho vinha depois de um `process.exit(0)` no erro de migração,
    e a primeira publicação com a variável ligada bateu justamente num
    `database is locked` — falha transitória, sem migração pendente nenhuma. O
    curso não foi criado por causa de um problema que não tinha relação com
    ele, e nada no log explicava a ausência.

    Se o schema estiver mesmo desatualizado, este passo falha sozinho e avisa,
    sem derrubar a publicação.
  */
  if (!migrou) {
    console.log("  [conteudo] a migração falhou antes; tentando assim mesmo.");
  }

  // fileURLToPath, e não `.pathname`: no Windows o pathname vem como
  // "/C:/..." e o node não acha o arquivo.
  const argumentos = [fileURLToPath(new URL("../prisma/curso-de-boas-vindas.mjs", import.meta.url))];
  if (/^(1|true|sim)$/i.test(process.env.CURSO_MATRICULAR_TODOS ?? "")) {
    argumentos.push("--matricular-todos");
  }
  if (process.env.CURSO_AUTOR?.trim()) {
    argumentos.push("--autor", process.env.CURSO_AUTOR.trim());
  }

  const saida = spawnSync(process.execPath, argumentos, {
    stdio: "inherit",
    env: process.env,
  });

  if ((saida.status ?? 1) !== 0) {
    console.error("\n  [conteudo] AVISO: a criação do curso de boas-vindas falhou.");
    console.error("  A publicação segue normalmente — o resto da plataforma não depende dela.\n");
  }
}
