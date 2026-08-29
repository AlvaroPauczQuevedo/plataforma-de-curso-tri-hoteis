import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conteudoConfereComTipo } from "../src/lib/file-signature";

/**
 * Validação do conteúdo dos arquivos enviados.
 *
 * Este módulo não toca o banco: são bytes entrando e um booleano saindo.
 */

/** Monta um cabeçalho com os bytes informados, preenchido até 16 bytes. */
function cabecalho(...bytes: number[]): Buffer {
  const buffer = Buffer.alloc(16);
  Buffer.from(bytes).copy(buffer);
  return buffer;
}

const MP4 = cabecalho(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32);
const PDF = cabecalho(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34);
const PNG = cabecalho(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = cabecalho(0xff, 0xd8, 0xff, 0xe0);
const WEBP = cabecalho(
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
);
const WEBM = cabecalho(0x1a, 0x45, 0xdf, 0xa3);
/** Cabeçalho de executável do Windows — o caso que motivou a checagem. */
const EXECUTAVEL = cabecalho(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);

describe("Arquivos legítimos são aceitos", () => {
  const casos: Array<[string, Buffer]> = [
    ["video/mp4", MP4],
    ["video/quicktime", MP4],
    ["video/webm", WEBM],
    ["application/pdf", PDF],
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/webp", WEBP],
  ];

  for (const [tipo, bytes] of casos) {
    it(`aceita ${tipo}`, () => {
      assert.equal(conteudoConfereComTipo(bytes, tipo), true);
    });
  }
});

describe("Arquivo disfarçado é recusado", () => {
  it("executável renomeado para vídeo não passa", () => {
    assert.equal(conteudoConfereComTipo(EXECUTAVEL, "video/mp4"), false);
  });

  it("executável declarado como PDF não passa", () => {
    assert.equal(conteudoConfereComTipo(EXECUTAVEL, "application/pdf"), false);
  });

  it("PNG declarado como PDF não passa", () => {
    assert.equal(conteudoConfereComTipo(PNG, "application/pdf"), false);
  });

  it("PDF declarado como imagem não passa", () => {
    assert.equal(conteudoConfereComTipo(PDF, "image/png"), false);
  });

  it("RIFF sem a marca WEBP não passa por WebP", () => {
    // RIFF é contêiner de vários formatos; só WEBP traz a marca no byte 8.
    const riffWave = cabecalho(
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45
    );
    assert.equal(conteudoConfereComTipo(riffWave, "image/webp"), false);
  });
});

describe("Casos de borda", () => {
  it("arquivo curto demais para ter assinatura é recusado", () => {
    assert.equal(conteudoConfereComTipo(Buffer.from([0x25, 0x50]), "application/pdf"), false);
  });

  it("arquivo vazio é recusado", () => {
    assert.equal(conteudoConfereComTipo(Buffer.alloc(0), "video/mp4"), false);
  });

  it("tipo sem assinatura conhecida é aceito", () => {
    // Preferimos aceitar um formato ainda não mapeado a recusar um envio
    // legítimo — a lista de tipos permitidos continua sendo a 1ª barreira.
    assert.equal(conteudoConfereComTipo(PDF, "text/csv"), true);
  });
});
