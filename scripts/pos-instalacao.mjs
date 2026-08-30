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
if (prisma("migrate", "deploy") !== 0) {
  console.error("\n  [migracao] AVISO: `prisma migrate deploy` falhou.");
  console.error("  A publicação segue, mas telas que dependem do schema novo vão");
  console.error("  apresentar erro. Resolva a migração antes de usar a plataforma.");
  console.error("  Causa mais comum: DATABASE_URL ausente no ambiente de publicação.\n");
  process.exit(0);
}

console.log("  [migracao] banco em dia.");
