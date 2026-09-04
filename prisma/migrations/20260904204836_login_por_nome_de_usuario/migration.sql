-- O login deixa de ser o e-mail e passa a ser um nome de usuario proprio.
--
-- A rede nao tem e-mail corporativo nem matricula: nao havia identificador
-- anterior para reaproveitar. O e-mail continua existindo, agora OPCIONAL e
-- pessoal, servindo apenas como canal de recuperacao de senha.
--
-- Esta migracao NAO foi deixada como o Prisma a gerou. A versao automatica
-- adiciona "username" como coluna obrigatoria sem valor, o que falha em
-- qualquer banco que ja tenha gente cadastrada — o proprio Prisma avisa isso.
-- As duas copias de dados abaixo foram escritas a mao para preservar o que ja
-- existe.

-- CreateTable
CREATE TABLE "EmailConfirmacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailConfirmacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_LoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- O historico de tentativas guarda o que foi DIGITADO, e ate ontem o que se
-- digitava era e-mail. A coluna muda de nome, o conteudo antigo permanece.
INSERT INTO "new_LoginAttempt" ("id", "identificador", "ip", "success", "createdAt")
SELECT "id", "email", "ip", "success", "createdAt" FROM "LoginAttempt";

DROP TABLE "LoginAttempt";
ALTER TABLE "new_LoginAttempt" RENAME TO "LoginAttempt";
CREATE INDEX "LoginAttempt_identificador_createdAt_idx" ON "LoginAttempt"("identificador", "createdAt");
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" TEXT,
    "departmentId" TEXT,
    "avatarUrl" TEXT,
    "lastLoginAt" DATETIME,
    "matricula" TEXT,
    "intranetEmployeeId" TEXT,
    "syncedAt" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "protegido" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Quem ja existe recebe como login a parte do e-mail antes da arroba:
-- "maria.silva@trihoteis.com.br" entra como "maria.silva". Ninguem fica de
-- fora, e para a maioria o login nem muda na pratica — e o que a pessoa ja
-- digitava, sem o dominio.
--
-- O e-mail antigo e PRESERVADO em vez de apagado. Ele pode nao existir de
-- verdade (a rede nunca teve caixa corporativa), mas apagar dado numa
-- migracao e irreversivel, e limpar um cadastro errado e trabalho de tela, com
-- alguem olhando. O @unique tolera: sao valores distintos entre si.
INSERT INTO "new_User" ("id", "name", "username", "email", "passwordHash", "role", "active", "position", "departmentId", "avatarUrl", "lastLoginAt", "matricula", "intranetEmployeeId", "syncedAt", "mustChangePassword", "protegido", "failedAttempts", "lockedUntil", "createdAt", "updatedAt")
SELECT
    "id",
    "name",
    CASE
        WHEN instr("email", '@') > 1 THEN lower(substr("email", 1, instr("email", '@') - 1))
        ELSE lower("email")
    END,
    "email",
    "passwordHash", "role", "active", "position", "departmentId", "avatarUrl",
    "lastLoginAt", "matricula", "intranetEmployeeId", "syncedAt",
    "mustChangePassword", "protegido", "failedAttempts", "lockedUntil",
    "createdAt", "updatedAt"
FROM "User";

-- Duas caixas em dominios diferentes podiam ter a mesma parte local
-- ("maria.silva@hotelA" e "maria.silva@hotelB"), e agora colidiriam num indice
-- unico — a migracao pararia no meio.
--
-- O desempate sai para uma tabela temporaria antes de ser aplicado. Um UPDATE
-- que consultasse "new_User" enquanto altera "new_User" veria as proprias
-- alteracoes no meio da varredura, e o resultado dependeria da ordem em que o
-- SQLite decidisse percorrer as linhas.
--
-- TODAS as linhas envolvidas ganham sufixo, inclusive a primeira: um
-- "maria.silva" intacto ao lado de um "maria.silva.2" esconderia que aquele
-- par precisa de decisao humana. Assim os dois aparecem marcados na tela de
-- Funcionarios, e quem administra renomeia com conhecimento de causa.
CREATE TEMP TABLE "desempate_username" AS
SELECT
    "id",
    "username" || '.' || CAST(ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS TEXT) AS "novo"
FROM "new_User"
WHERE "username" IN (
    SELECT "username" FROM "new_User" GROUP BY "username" HAVING COUNT(*) > 1
);

UPDATE "new_User"
SET "username" = (SELECT "novo" FROM "desempate_username" WHERE "desempate_username"."id" = "new_User"."id")
WHERE "id" IN (SELECT "id" FROM "desempate_username");

DROP TABLE "desempate_username";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_matricula_key" ON "User"("matricula");
CREATE UNIQUE INDEX "User_intranetEmployeeId_key" ON "User"("intranetEmployeeId");
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EmailConfirmacao_token_key" ON "EmailConfirmacao"("token");

-- CreateIndex
CREATE INDEX "EmailConfirmacao_userId_idx" ON "EmailConfirmacao"("userId");
