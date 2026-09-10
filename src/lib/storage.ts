import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as ReadableStreamDoNode } from "node:stream/web";
import { pipeline } from "node:stream/promises";
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

/**
 * Grava o arquivo enviado, EM FLUXO.
 *
 * Antes era `writeFile(caminho, Buffer.from(await file.arrayBuffer()))`, o que
 * pedia ao Node uma cópia inteira do arquivo na memória — com o teto de 500 MB
 * por envio, dois vídeos ao mesmo tempo derrubavam o processo numa hospedagem
 * modesta. Em fluxo, o que passa pela memória são pedaços.
 *
 * RESSALVA que precisa ficar escrita, senão o próximo a ler isto vai achar que
 * o problema acabou: quem monta o `File` é o `request.formData()` do próprio
 * Next, e ELE já leu o corpo inteiro para a memória antes de esta função ser
 * chamada. O que se economiza aqui é a SEGUNDA cópia — o pico cai à metade,
 * não a zero. Zerar exigiria ler `request.body` como fluxo e interpretar o
 * multipart na mão, o que traz um analisador de formato para dentro do
 * projeto. Enquanto isso não acontecer, `UPLOAD_MAX_SIZE_MB` é o que de fato
 * limita a memória do servidor, e é por ele que se ajusta.
 *
 * O arquivo pela metade é apagado se a gravação falhar. Sem isso, uma conexão
 * interrompida deixaria um vídeo truncado no acervo, sem `FileAsset` para
 * apontar para ele — lixo que ninguém encontra e ninguém remove.
 */
export async function saveUploadedFile(
  file: File,
  kind: UploadKind
): Promise<{ storagePath: string; filename: string }> {
  const dir = path.join(STORAGE_ROOT, kind);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(dir, filename);

  try {
    await pipeline(
      // `file.stream()` devolve o ReadableStream da web; `Readable.fromWeb`
      // pede o do Node. São o mesmo objeto em tempo de execução — a conversão
      // é só de tipo, como em /api/files, que faz o caminho inverso.
      Readable.fromWeb(file.stream() as unknown as ReadableStreamDoNode<Uint8Array>),
      createWriteStream(fullPath)
    );
  } catch (erro) {
    await rm(fullPath, { force: true }).catch(() => {});
    throw erro;
  }

  return {
    storagePath: path.join(kind, filename),
    filename,
  };
}

export function absoluteStoragePath(storagePath: string) {
  return path.join(STORAGE_ROOT, storagePath);
}

export const MAX_UPLOAD_BYTES =
  Number(process.env.UPLOAD_MAX_SIZE_MB ?? 500) * 1024 * 1024;
