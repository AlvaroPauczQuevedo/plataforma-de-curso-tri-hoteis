import { open } from "fs/promises";
import { absoluteStoragePath } from "@/lib/storage";

/**
 * Lê a duração de um vídeo MP4/MOV diretamente do arquivo, percorrendo os
 * "boxes" do container até encontrar o cabeçalho `mvhd` dentro de `moov`.
 *
 * A duração precisa vir do servidor: se ela fosse informada pelo navegador,
 * bastaria declarar um vídeo de 1 segundo para concluir instantaneamente uma
 * aula de meia hora. Só os cabeçalhos são lidos — o arquivo não é carregado
 * na memória.
 */
export async function readVideoDurationSeconds(
  storagePath: string
): Promise<number | null> {
  let handle;
  try {
    handle = await open(absoluteStoragePath(storagePath), "r");
    const { size } = await handle.stat();
    return await findMvhd(handle, 0, size);
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

const CONTAINERS = new Set(["moov", "trak", "mdia"]);

async function readBytes(handle: Awaited<ReturnType<typeof open>>, offset: number, length: number) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  return bytesRead === length ? buffer : null;
}

async function findMvhd(
  handle: Awaited<ReturnType<typeof open>>,
  start: number,
  end: number,
  depth = 0
): Promise<number | null> {
  if (depth > 4) return null;

  let offset = start;
  while (offset + 8 <= end) {
    const header = await readBytes(handle, offset, 8);
    if (!header) return null;

    let boxSize = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    let headerSize = 8;

    if (boxSize === 1) {
      // tamanho de 64 bits declarado logo após o tipo
      const large = await readBytes(handle, offset + 8, 8);
      if (!large) return null;
      boxSize = Number(large.readBigUInt64BE(0));
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = end - offset; // box vai até o fim do arquivo
    }

    if (boxSize < headerSize) return null;

    if (type === "mvhd") {
      const body = await readBytes(handle, offset + headerSize, 32);
      if (!body) return null;
      const version = body.readUInt8(0);
      // v0: timescale/duration em 32 bits; v1: datas de 64 bits antes deles
      const timescale = version === 1 ? body.readUInt32BE(20) : body.readUInt32BE(12);
      const duration =
        version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
      if (!timescale || !duration) return null;
      return Math.round(duration / timescale);
    }

    if (CONTAINERS.has(type)) {
      const found = await findMvhd(handle, offset + headerSize, offset + boxSize, depth + 1);
      if (found) return found;
    }

    offset += boxSize;
  }

  return null;
}
