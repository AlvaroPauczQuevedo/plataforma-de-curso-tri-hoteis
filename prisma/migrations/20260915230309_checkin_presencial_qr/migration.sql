-- CreateTable
CREATE TABLE "SessaoPresencial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "titulo" TEXT,
    "instrutor" TEXT NOT NULL,
    "local" TEXT,
    "segredo" TEXT NOT NULL,
    "realizadaEm" DATETIME NOT NULL,
    "abertaAte" DATETIME,
    "encerradaEm" DATETIME,
    "criadaPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessaoPresencial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessaoPresencial_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresencaEmSessao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessaoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registradaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    CONSTRAINT "PresencaEmSessao_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoPresencial" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PresencaEmSessao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SessaoPresencial_courseId_idx" ON "SessaoPresencial"("courseId");

-- CreateIndex
CREATE INDEX "PresencaEmSessao_userId_idx" ON "PresencaEmSessao"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PresencaEmSessao_sessaoId_userId_key" ON "PresencaEmSessao"("sessaoId", "userId");
