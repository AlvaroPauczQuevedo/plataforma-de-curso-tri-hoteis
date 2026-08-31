-- CreateTable
CREATE TABLE "Prova" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "departmentId" TEXT,
    "notaMinima" INTEGER NOT NULL DEFAULT 70,
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prova_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Prova_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestaoProva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provaId" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuestaoProva_provaId_fkey" FOREIGN KEY ("provaId") REFERENCES "Prova" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlternativaProva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questaoId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "correta" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AlternativaProva_questaoId_fkey" FOREIGN KEY ("questaoId") REFERENCES "QuestaoProva" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TentativaProva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "acertos" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "aprovado" BOOLEAN NOT NULL,
    "respostas" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TentativaProva_provaId_fkey" FOREIGN KEY ("provaId") REFERENCES "Prova" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TentativaProva_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Prova_departmentId_idx" ON "Prova"("departmentId");

-- CreateIndex
CREATE INDEX "QuestaoProva_provaId_idx" ON "QuestaoProva"("provaId");

-- CreateIndex
CREATE INDEX "AlternativaProva_questaoId_idx" ON "AlternativaProva"("questaoId");

-- CreateIndex
CREATE INDEX "TentativaProva_userId_provaId_idx" ON "TentativaProva"("userId", "provaId");

-- CreateIndex
CREATE INDEX "TentativaProva_provaId_idx" ON "TentativaProva"("provaId");
