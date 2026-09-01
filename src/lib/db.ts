import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  walLigado: boolean | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * SQLite em modo WAL (Write-Ahead Logging).
 *
 * No modo padrão do SQLite, uma escrita tranca o arquivo inteiro e toda
 * leitura concorrente espera. Esta plataforma escreve o tempo todo: o player
 * grava o avanço do vídeo a cada quatro segundos, POR ALUNO — trinta pessoas
 * assistindo dão centenas de transações por minuto, e cada uma delas segura as
 * telas de quem está apenas lendo. O sintoma é `SQLITE_BUSY` aparecendo em
 * consultas que não têm nada a ver com vídeo.
 *
 * Em WAL, leitura e escrita param de disputar: quem lê continua enxergando a
 * última versão consolidada enquanto a escrita acontece ao lado.
 *
 * O modo fica gravado no próprio arquivo do banco, então ligá-lo uma vez basta.
 * A chamada continua aqui para o caso de o banco ser novo, ou de alguém
 * restaurar um backup feito antes desta mudança.
 *
 * Uma ressalva: WAL não funciona em sistema de arquivos de rede (NFS, SMB). Se
 * o DATABASE_URL apontar para um compartilhamento, o PRAGMA falha, o aviso
 * entra no registro de erros e o banco segue no modo antigo — que é o
 * comportamento de sempre, não uma regressão.
 */
if (!globalForPrisma.walLigado) {
  globalForPrisma.walLigado = true;

  void db.$queryRawUnsafe("PRAGMA journal_mode = WAL").catch((erro: unknown) => {
    console.error("[banco] nao foi possivel ligar o WAL:", (erro as Error)?.message);
  });
}
