import { NextRequest, NextResponse } from "next/server";
import { sessaoDeApi } from "@/lib/session";
import { db } from "@/lib/db";
import { saveUploadedFile, MAX_UPLOAD_BYTES, type UploadKind } from "@/lib/storage";
import { conteudoConfereComTipo } from "@/lib/file-signature";

const ALLOWED_MIME: Record<UploadKind, string[]> = {
  videos: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
  pdfs: ["application/pdf"],
  covers: ["image/jpeg", "image/png", "image/webp"],
  avatars: ["image/jpeg", "image/png", "image/webp"],
};

export async function POST(request: NextRequest) {
  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind") as UploadKind | null;

  if (!(file instanceof File) || !kind) {
    return NextResponse.json({ error: "Arquivo ou tipo inválido." }, { status: 400 });
  }

  if (kind !== "avatars" && usuario.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem enviar este tipo de arquivo." }, { status: 403 });
  }

  if (!["videos", "pdfs", "covers", "avatars"].includes(kind)) {
    return NextResponse.json({ error: "Tipo de upload desconhecido." }, { status: 400 });
  }

  if (!ALLOWED_MIME[kind].includes(file.type)) {
    return NextResponse.json(
      { error: `Formato não permitido para ${kind}. Aceitos: ${ALLOWED_MIME[kind].join(", ")}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo excede o limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
      { status: 400 }
    );
  }

  // O tipo acima é o que o navegador declarou; aqui o conteúdo é conferido.
  // Sem isto, renomear um executável para .mp4 basta para gravá-lo no acervo.
  const inicio = Buffer.from(await file.slice(0, 16).arrayBuffer());
  if (!conteudoConfereComTipo(inicio, file.type)) {
    return NextResponse.json(
      { error: "O conteúdo do arquivo não corresponde ao formato informado." },
      { status: 400 }
    );
  }

  const { storagePath, filename } = await saveUploadedFile(file, kind);

  const kindLabel = { videos: "VIDEO", pdfs: "PDF", covers: "COVER", avatars: "AVATAR" }[kind];

  const asset = await db.fileAsset.create({
    data: {
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      storagePath,
      kind: kindLabel,
      uploadedById: usuario.id,
    },
  });

  return NextResponse.json({ id: asset.id, url: `/api/files/${asset.id}` });
}
