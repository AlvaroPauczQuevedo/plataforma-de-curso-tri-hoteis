import { writeFile, mkdir } from "fs/promises";
import { createReadStream, statSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Onde ficam os vídeos, PDFs e imagens enviados.
 *
 * Configurável por STORAGE_DIR porque, em hospedagem que publica substituindo
 * o diretório da aplicação, tudo que estiver dentro do projeto é perdido a
 * cada atualização. Em produção aponte para um caminho FORA da pasta do
 * projeto — o mesmo cuidado que DATABASE_URL exige.
 */
/*
  O `turbopackIgnore` abaixo é deliberado.

  O Turbopack avisa que um caminho montado em tempo de execução obriga a
  rastrear o projeto inteiro para o pacote de produção — e ele está certo sobre
  o mecanismo. Mas aqui o caminho é configurável DE PROPÓSITO: em produção ele
  aponta para fora da pasta da aplicação, porque publicar substitui essa pasta
  e levaria embora os arquivos junto. Prendê-lo a uma subpasta estática, que é
  a outra saída sugerida, desfaria justamente o que ele existe para permitir.
*/
export const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_DIR ||
    path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "uploads")
);

export type UploadKind = "videos" | "pdfs" | "covers" | "avatars";

export async function saveUploadedFile(
  file: File,
  kind: UploadKind
): Promise<{ storagePath: string; filename: string }> {
  const dir = path.join(STORAGE_ROOT, kind);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(dir, filename);

  const arrayBuffer = await file.arrayBuffer();
  await writeFile(fullPath, Buffer.from(arrayBuffer));

  return {
    storagePath: path.join(kind, filename),
    filename,
  };
}

export function absoluteStoragePath(storagePath: string) {
  return path.join(STORAGE_ROOT, storagePath);
}

export function fileSizeOf(storagePath: string) {
  return statSync(absoluteStoragePath(storagePath)).size;
}

export function readFileStream(storagePath: string, range?: { start: number; end: number }) {
  return createReadStream(absoluteStoragePath(storagePath), range);
}

export const MAX_UPLOAD_BYTES =
  Number(process.env.UPLOAD_MAX_SIZE_MB ?? 500) * 1024 * 1024;
