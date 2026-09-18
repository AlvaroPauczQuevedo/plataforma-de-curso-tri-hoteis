-- CreateTable
CREATE TABLE "HabilitacaoDeInstrutor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "instrutor" TEXT NOT NULL,
    "registro" TEXT,
    "arquivoId" TEXT NOT NULL,
    "validoAte" DATETIME,
    "declaradoPorId" TEXT NOT NULL,
    "declaradoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',
    "termoAceito" TEXT NOT NULL,
    CONSTRAINT "HabilitacaoDeInstrutor_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HabilitacaoDeInstrutor_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "FileAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HabilitacaoDeInstrutor_declaradoPorId_fkey" FOREIGN KEY ("declaradoPorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "instructor" TEXT,
    "coverFileId" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "difficulty" TEXT NOT NULL DEFAULT 'INICIANTE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "exigeInstrutorHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "videoCompletionThreshold" INTEGER NOT NULL DEFAULT 90,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Course_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("allowDownload", "categoryId", "certificateEnabled", "coverFileId", "createdAt", "createdById", "departmentId", "description", "difficulty", "durationMinutes", "id", "instructor", "sequential", "status", "title", "updatedAt", "videoCompletionThreshold") SELECT "allowDownload", "categoryId", "certificateEnabled", "coverFileId", "createdAt", "createdById", "departmentId", "description", "difficulty", "durationMinutes", "id", "instructor", "sequential", "status", "title", "updatedAt", "videoCompletionThreshold" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE INDEX "Course_status_idx" ON "Course"("status");
CREATE INDEX "Course_departmentId_idx" ON "Course"("departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HabilitacaoDeInstrutor_courseId_idx" ON "HabilitacaoDeInstrutor"("courseId");
