-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "videoSource" TEXT,
    "videoFileId" TEXT,
    "videoEmbedUrl" TEXT,
    "videoDurationSeconds" INTEGER,
    "pdfFileId" TEXT,
    "textContent" TEXT,
    "provaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lesson_videoFileId_fkey" FOREIGN KEY ("videoFileId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lesson_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lesson_provaId_fkey" FOREIGN KEY ("provaId") REFERENCES "Prova" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lesson" ("createdAt", "id", "moduleId", "order", "pdfFileId", "required", "textContent", "title", "type", "updatedAt", "videoDurationSeconds", "videoEmbedUrl", "videoFileId", "videoSource") SELECT "createdAt", "id", "moduleId", "order", "pdfFileId", "required", "textContent", "title", "type", "updatedAt", "videoDurationSeconds", "videoEmbedUrl", "videoFileId", "videoSource" FROM "Lesson";
DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE INDEX "Lesson_moduleId_idx" ON "Lesson"("moduleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
