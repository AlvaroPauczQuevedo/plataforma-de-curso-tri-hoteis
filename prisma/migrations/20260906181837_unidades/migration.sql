-- CreateTable
CREATE TABLE "Unidade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UnidadeExtra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnidadeExtra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnidadeExtra_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" TEXT,
    "departmentId" TEXT,
    "unidadeId" TEXT,
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
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("active", "avatarUrl", "createdAt", "departmentId", "email", "failedAttempts", "id", "intranetEmployeeId", "lastLoginAt", "lockedUntil", "matricula", "mustChangePassword", "name", "passwordHash", "position", "protegido", "role", "syncedAt", "telefone", "updatedAt", "username") SELECT "active", "avatarUrl", "createdAt", "departmentId", "email", "failedAttempts", "id", "intranetEmployeeId", "lastLoginAt", "lockedUntil", "matricula", "mustChangePassword", "name", "passwordHash", "position", "protegido", "role", "syncedAt", "telefone", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_matricula_key" ON "User"("matricula");
CREATE UNIQUE INDEX "User_intranetEmployeeId_key" ON "User"("intranetEmployeeId");
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");
CREATE INDEX "User_unidadeId_idx" ON "User"("unidadeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_name_key" ON "Unidade"("name");

-- CreateIndex
CREATE INDEX "UnidadeExtra_unidadeId_idx" ON "UnidadeExtra"("unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeExtra_userId_unidadeId_key" ON "UnidadeExtra"("userId", "unidadeId");
