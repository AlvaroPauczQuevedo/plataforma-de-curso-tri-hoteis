import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/*
  O modo WAL do SQLite é ligado em `src/instrumentation-node.ts`, e não aqui.

  Aqui seria o lugar óbvio, e foi onde ficou primeiro — mas este módulo é
  avaliado toda vez que alguém o importa, inclusive pelo `next build` ao
  coletar os dados das páginas. Sem DATABASE_URL definida no ambiente de
  build, cada avaliação disparava uma consulta que falhava, e o build passou a
  cuspir nove erros de Prisma antes de terminar com sucesso. Erro que aparece
  num build que deu certo é pior do que erro nenhum: ensina quem lê o log a
  ignorá-lo, e o próximo erro de verdade passa junto.

  A instrumentação roda uma vez, na subida do servidor, que é exatamente
  quando se quer ligar o WAL.
*/
