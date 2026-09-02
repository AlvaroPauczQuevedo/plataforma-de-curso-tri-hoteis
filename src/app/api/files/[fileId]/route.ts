import { NextRequest, NextResponse } from "next/server";
import { sessaoDeApi } from "@/lib/session";
import { db } from "@/lib/db";
import { absoluteStoragePath } from "@/lib/storage";
import { fileBelongsToAccessibleCourse } from "@/lib/access";
import { faixaPedida } from "@/lib/faixa-de-bytes";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";

export async function GET(request: NextRequest, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const { fileId } = params;

  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!file) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const allowed = await fileBelongsToAccessibleCourse(
    usuario.id,
    fileId,
    usuario.role === "ADMIN"
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

  /*
    Só vídeo responde por trecho: é o único formato que o navegador pede aos
    pedaços, e a conta da faixa vive em lib/faixa-de-bytes, onde dá para
    exercitar as bordas sem subir servidor.
  */
  if (range && file.mimeType.startsWith("video/")) {
    const faixa = faixaPedida(range, stat.size);

    if (faixa.tipo === "fora-do-arquivo") {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + String(stat.size) },
      });
    }

    if (faixa.tipo === "trecho") {
      const { inicio, fim } = faixa;

      headers.set("Content-Range", "bytes " + inicio + "-" + fim + "/" + stat.size);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", String(fim - inicio + 1));

      const trecho = createReadStream(fullPath, { start: inicio, end: fim });
      return new NextResponse(Readable.toWeb(trecho) as ReadableStream, {
        status: 206,
        headers,
      });
    }
    // "arquivo-inteiro": cai no 200 comum, logo abaixo.
  }

  headers.set("Content-Length", String(stat.size));
  headers.set("Accept-Ranges", "bytes");
  const stream = createReadStream(fullPath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers,
  });
}
