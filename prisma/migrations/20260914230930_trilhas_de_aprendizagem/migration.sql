-- CreateTable
CREATE TABLE "Trilha" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "departmentId" TEXT,
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trilha_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trilha_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrilhaCurso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trilhaId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    CONSTRAINT "TrilhaCurso_trilhaId_fkey" FOREIGN KEY ("trilhaId") REFERENCES "Trilha" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrilhaCurso_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrilhaDepartamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trilhaId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "prazoDias" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrilhaDepartamento_trilhaId_fkey" FOREIGN KEY ("trilhaId") REFERENCES "Trilha" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrilhaDepartamento_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Trilha_departmentId_idx" ON "Trilha"("departmentId");

-- CreateIndex
CREATE INDEX "TrilhaCurso_courseId_idx" ON "TrilhaCurso"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrilhaCurso_trilhaId_courseId_key" ON "TrilhaCurso"("trilhaId", "courseId");

-- CreateIndex
CREATE INDEX "TrilhaDepartamento_departmentId_idx" ON "TrilhaDepartamento"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrilhaDepartamento_trilhaId_departmentId_key" ON "TrilhaDepartamento"("trilhaId", "departmentId");
