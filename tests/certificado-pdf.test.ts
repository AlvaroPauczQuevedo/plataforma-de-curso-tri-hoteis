import assert from "node:assert/strict";
import { describe, it } from "node:test";
import qrcode from "qrcode-generator";
import { generateCertificatePdf } from "../src/lib/certificate";

/**
 * O certificado em PDF, e o QR que leva à conferência pública.
 *
 * O QR é a peça que transforma a validação de "existe" em "usada": sem ele, um
 * auditor com o papel na mão precisa digitar vinte caracteres numa URL. E é o
 * tipo de coisa que falha em silêncio — um código espelhado, ou desenhado sem
 * zona de silêncio, continua parecendo um QR e não abre em leitor nenhum.
 *
 * O que dá para provar sem uma câmera é a estrutura, e é o que está aqui.
 */

const DADOS = {
  employeeName: "Marina Costa",
  courseTitle: "Segurança no Trabalho",
  durationMinutes: 90,
  issuedAt: new Date("2026-06-01T12:00:00Z"),
  code: "CERT-2026-A1B2C3D4E5",
};

/** Roda algo com NEXTAUTH_URL definida (ou ausente) e devolve tudo ao lugar. */
async function comEndereco<T>(valor: string | undefined, acao: () => Promise<T>): Promise<T> {
  const anterior = process.env.NEXTAUTH_URL;
  if (valor === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = valor;

  try {
    return await acao();
  } finally {
    if (anterior === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = anterior;
  }
}

const gerar = async () => Buffer.from(await generateCertificatePdf(DADOS));

describe("Geração do certificado", () => {
  it("produz um PDF válido", async () => {
    const pdf = await comEndereco("https://academia.trihoteis.com.br", gerar);

    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 5000, `${pdf.length} bytes é pequeno demais para o modelo`);
  });

  it("sai mesmo sem NEXTAUTH_URL definida", async () => {
    // Sem endereço público não há o que conferir, e o certificado continua
    // valendo como documento. Deixar de emiti-lo seria pior.
    const pdf = await comEndereco(undefined, gerar);

    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });

  it("o QR só aparece quando há endereço para apontar", async () => {
    /*
      A prova indireta de que o QR é realmente desenhado: são centenas de
      retângulos, um por módulo escuro. Se o desenho parar de acontecer, os dois
      arquivos ficam do mesmo tamanho — e é assim que este teste falha.
    */
    const com = await comEndereco("https://academia.trihoteis.com.br", gerar);
    const sem = await comEndereco(undefined, gerar);

    assert.ok(
      com.length > sem.length + 2000,
      `com QR: ${com.length} bytes, sem QR: ${sem.length} bytes — diferença pequena demais`
    );
  });
});

describe("Estrutura do QR de conferência", () => {
  /*
    A matriz vem da mesma biblioteca e do mesmo endereço que o certificado usa.
    O que se confere aqui é o que torna um QR legível: os três padrões de
    localização nas quinas certas. Espelhado ou girado, eles caem nos cantos
    errados e nenhum leitor encontra o código.
  */
  const endereco = `https://academia.trihoteis.com.br/validar/${DADOS.code}`;
  const qr = qrcode(0, "M");
  qr.addData(endereco);
  qr.make();
  const n = qr.getModuleCount();

  /** O padrão de localização: moldura 7x7 com miolo 3x3. */
  function ehPadraoDeLocalizacao(linha0: number, coluna0: number) {
    for (let l = 0; l < 7; l += 1) {
      for (let c = 0; c < 7; c += 1) {
        const borda = l === 0 || l === 6 || c === 0 || c === 6;
        const miolo = l >= 2 && l <= 4 && c >= 2 && c <= 4;
        if (qr.isDark(linha0 + l, coluna0 + c) !== (borda || miolo)) return false;
      }
    }
    return true;
  }

  it("tem os três padrões de localização nas quinas corretas", () => {
    assert.ok(ehPadraoDeLocalizacao(0, 0), "superior esquerdo");
    assert.ok(ehPadraoDeLocalizacao(0, n - 7), "superior direito");
    assert.ok(ehPadraoDeLocalizacao(n - 7, 0), "inferior esquerdo");
  });

  it("a quina inferior direita NÃO tem padrão de localização", () => {
    // São três, nunca quatro: é a assimetria que diz ao leitor a orientação.
    assert.ok(!ehPadraoDeLocalizacao(n - 7, n - 7));
  });

  it("a matriz é quadrada e do tamanho esperado para o endereço", () => {
    assert.ok(n >= 21, `${n} módulos é menor que a menor versão de QR`);
    assert.equal(n % 4, 1, "toda versão de QR tem 4v+17 módulos");
  });
});
