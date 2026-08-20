import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { db } from "@/lib/db";
import { absoluteStoragePath } from "@/lib/storage";
import { fileBelongsToAccessibleCourse } from "@/lib/access";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!file) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const allowed = await fileBelongsToAccessibleCourse(
    session.user.id,
    fileId,
    session.user.role === "ADMIN"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Acesso não autorizado a este arquivo." }, { status: 403 });
  }

  const fullPath = absoluteStoragePath(file.storagePath);
  let stat;
  try {
    stat = statSync(fullPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
  }

  // Arquivos são sempre servidos inline (exibidos dentro do player/visualizador
  // da plataforma). O bloqueio de download do PDF é reforçado na interface do
  // visualizador (lib/access.ts controla quem pode sequer requisitar o arquivo).
  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
    "Cache-Control": "private, max-age=3600",
  });

  const range = request.headers.get("range");

  if (range && file.mimeType.startsWith("video/")) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", String(chunkSize));

    const stream = createReadStream(fullPath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(stat.size));
  headers.set("Accept-Ranges", "bytes");
  const stream = createReadStream(fullPath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers,
  });
}
