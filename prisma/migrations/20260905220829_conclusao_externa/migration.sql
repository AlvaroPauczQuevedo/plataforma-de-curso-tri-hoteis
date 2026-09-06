-- CreateTable
CREATE TABLE "ConclusaoExterna" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "concluidoEm" DATETIME NOT NULL,
    "instrutor" TEXT,
    "observacao" TEXT,
    "comprovanteId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConclusaoExterna_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConclusaoExterna_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConclusaoExterna_comprovanteId_fkey" FOREIGN KEY ("comprovanteId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConclusaoExterna_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConclusaoExterna_courseId_idx" ON "ConclusaoExterna"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ConclusaoExterna_userId_courseId_key" ON "ConclusaoExterna"("userId", "courseId");
