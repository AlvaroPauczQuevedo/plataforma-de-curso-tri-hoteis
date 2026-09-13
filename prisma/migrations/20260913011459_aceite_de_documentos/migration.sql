-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "arquivoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Documento_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "FileAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Documento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentoDepartamento" (
    "documentoId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    PRIMARY KEY ("documentoId", "departmentId"),
    CONSTRAINT "DocumentoDepartamento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentoDepartamento_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AceiteDeDocumento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "aceitoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AceiteDeDocumento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AceiteDeDocumento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Documento_publicado_idx" ON "Documento"("publicado");

-- CreateIndex
CREATE INDEX "DocumentoDepartamento_departmentId_idx" ON "DocumentoDepartamento"("departmentId");

-- CreateIndex
CREATE INDEX "AceiteDeDocumento_documentoId_idx" ON "AceiteDeDocumento"("documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "AceiteDeDocumento_userId_documentoId_versao_key" ON "AceiteDeDocumento"("userId", "documentoId", "versao");
