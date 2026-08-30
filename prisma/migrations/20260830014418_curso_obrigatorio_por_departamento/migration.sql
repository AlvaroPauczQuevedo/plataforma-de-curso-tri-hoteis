-- CreateTable
CREATE TABLE "CursoObrigatorio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "prazoDias" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CursoObrigatorio_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CursoObrigatorio_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CursoObrigatorio_departmentId_idx" ON "CursoObrigatorio"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CursoObrigatorio_courseId_departmentId_key" ON "CursoObrigatorio"("courseId", "departmentId");
