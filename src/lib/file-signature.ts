/**
 * Confere o tipo de um arquivo pelo conteúdo, não pelo que o navegador diz.
 *
 * O `Content-Type` de um upload é escrito pelo cliente: quem envia escolhe o
 * valor. Sem esta checagem, qualquer arquivo entra na plataforma desde que
 * venha rotulado como MP4 ou PDF.
 *
 * A verificação é pelos primeiros bytes — a "assinatura" que cada formato
 * grava no início do arquivo. Não substitui um antivírus; fecha a porta de
 * gravar um executável no acervo e servi-lo depois.
 */

type Verificador = (bytes: Uint8Array) => boolean;

const começaCom = (...esperado: number[]): Verificador =>
  (bytes) => esperado.every((valor, i) => bytes[i] === valor);

/** MP4/MOV: os bytes 4..7 trazem "ftyp"; o tamanho vem antes. */
const ehMp4: Verificador = (bytes) =>
  bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;

/** WebM e OGG usam contêineres com assinatura fixa no início. */
const ehWebm = começaCom(0x1a, 0x45, 0xdf, 0xa3);
const ehOgg = começaCom(0x4f, 0x67, 0x67, 0x53); // "OggS"

const ehPdf = começaCom(0x25, 0x50, 0x44, 0x46); // "%PDF"
const ehPng = começaCom(0x89, 0x50, 0x4e, 0x47);
const ehJpeg = começaCom(0xff, 0xd8, 0xff);
/** WebP é RIFF....WEBP: a marca aparece no byte 8. */
const ehWebp: Verificador = (bytes) =>
  começaCom(0x52, 0x49, 0x46, 0x46)(bytes) &&
  bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

const ASSINATURAS: Record<string, Verificador> = {
  "video/mp4": ehMp4,
  "video/quicktime": ehMp4,
  "video/webm": ehWebm,
  "video/ogg": ehOgg,
  "application/pdf": ehPdf,
  "image/png": ehPng,
  "image/jpeg": ehJpeg,
  "image/webp": ehWebp,
};

/**
 * O conteúdo corresponde ao tipo declarado?
 *
 * Tipo sem assinatura conhecida devolve `true`: é melhor aceitar um formato
 * que ainda não mapeamos do que recusar um envio legítimo. A lista de tipos
 * permitidos continua sendo a primeira barreira.
 */
export function conteudoConfereComTipo(buffer: Buffer, mimeDeclarado: string): boolean {
  const verificador = ASSINATURAS[mimeDeclarado];
  if (!verificador) return true;
  if (buffer.length < 12) return false;
  return verificador(new Uint8Array(buffer.subarray(0, 16)));
}
