-- CreateTable
CREATE TABLE "LembreteEnviado" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "estagio" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "enviadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LembreteEnviado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LembreteEnviado_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LembreteEnviado_enviadoEm_idx" ON "LembreteEnviado"("enviadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "LembreteEnviado_userId_courseId_estagio_key" ON "LembreteEnviado"("userId", "courseId", "estagio");
