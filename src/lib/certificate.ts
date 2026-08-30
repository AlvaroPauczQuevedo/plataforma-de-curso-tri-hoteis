/**
 * Certificado de conclusão, em PDF.
 *
 * A composição segue o modelo aprovado: quinas angulares, título alinhado à
 * esquerda, nome do aluno em destaque, selo à direita e a marca no alto —
 * trocadas as cores do modelo pelas da Tri Hotéis (laranja #FF6A00 sobre
 * grafite quente, os mesmos tokens de `globals.css`).
 *
 * Tudo é desenhado com primitivas do pdf-lib, sem imagem de fundo: o arquivo
 * fica leve, imprime nítido em qualquer tamanho e o layout acompanha nomes de
 * curso longos sem precisar de arte nova.
 *
 * O código de verificação e o endereço de conferência continuam impressos. São
 * o que transforma o certificado em documento checável por terceiros, e por
 * isso ocupam lugar fixo no rodapé, longe das áreas decorativas.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDate } from "@/lib/utils";

/* Identidade Tri Hotéis — espelha os tokens de globals.css. */
const LARANJA = rgb(1, 0.416, 0); // brand-500 #ff6a00
const LARANJA_ESCURO = rgb(0.8, 0.29, 0); // brand-700 #cc4a00
const LARANJA_CLARO = rgb(1, 0.522, 0.204); // brand-400 #ff8534
const GRAFITE = rgb(0.11, 0.098, 0.09); // ink-900 #1c1917
const CINZA = rgb(0.267, 0.251, 0.235); // ink-700 #44403c
const PAPEL = rgb(0.969, 0.957, 0.945); // surface-muted, levemente quente
const BRANCO = rgb(1, 1, 1);

const LARGURA = 842; // A4 paisagem
const ALTURA = 595;
const MARGEM = 78;

export async function generateCertificatePdf(params: {
  employeeName: string;
  courseTitle: string;
  durationMinutes: number;
  issuedAt: Date;
  code: string;
}) {
  const { employeeName, courseTitle, durationMinutes, issuedAt, code } = params;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([LARGURA, ALTURA]);

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  // O modelo pede manuscrito no nome. Sem fonte externa embarcada, a itálica
  // serifada é o que mais se aproxima disso usando as fontes padrão do PDF.
  const manuscrito = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  page.drawRectangle({ x: 0, y: 0, width: LARGURA, height: ALTURA, color: PAPEL });

  desenharQuinas(page);
  await desenharLogo(pdfDoc, page);
  desenharSelo(page);

  // ------------------------------------------------------------- título

  page.drawText("CERTIFICADO", {
    x: MARGEM,
    y: ALTURA - 148,
    size: 44,
    font: bold,
    color: LARANJA_ESCURO,
  });

  escreverEspacado(page, "DE CONCLUSÃO", {
    x: MARGEM + 2,
    y: ALTURA - 178,
    size: 16,
    font: regular,
    color: CINZA,
    espaco: 2.4,
  });

  // -------------------------------------------------------------- aluno

  page.drawText(employeeName, {
    x: MARGEM,
    y: ALTURA - 248,
    size: ajustarCorpo(employeeName, manuscrito, 34, 470),
    font: manuscrito,
    color: GRAFITE,
  });

  page.drawLine({
    start: { x: MARGEM, y: ALTURA - 268 },
    end: { x: MARGEM + 420, y: ALTURA - 268 },
    thickness: 0.8,
    color: LARANJA,
  });

  // -------------------------------------------------------------- curso

  page.drawText("Concluiu com total aproveitamento o curso", {
    x: MARGEM,
    y: ALTURA - 316,
    size: 12,
    font: regular,
    color: CINZA,
  });

  page.drawText(courseTitle, {
    x: MARGEM,
    y: ALTURA - 342,
    size: ajustarCorpo(courseTitle, bold, 19, 470),
    font: bold,
    color: GRAFITE,
  });

  const horas = Math.round((durationMinutes / 60) * 10) / 10;
  page.drawText(`Carga horária: ${horas} hora(s)`, {
    x: MARGEM,
    y: ALTURA - 368,
    size: 10.5,
    font: regular,
    color: CINZA,
  });

  // ------------------------------------------------- data e assinatura

  page.drawText(formatDate(issuedAt), {
    x: MARGEM,
    y: 168,
    size: 11,
    font: regular,
    color: CINZA,
  });

  page.drawLine({
    start: { x: 300, y: 180 },
    end: { x: 520, y: 180 },
    thickness: 0.8,
    color: CINZA,
  });

  centralizarEm(page, "Academia Corporativa Tri Hotéis", 300, 520, {
    y: 166,
    size: 10,
    font: regular,
    color: CINZA,
  });

  // ---------------------------------------------------------- conferência

  page.drawText(`Código de verificação: ${code}`, {
    x: MARGEM,
    y: 118,
    size: 10,
    font: bold,
    color: GRAFITE,
  });

  const base = (process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  if (base) {
    page.drawText(`Confira a autenticidade em ${base}/validar/${code}`, {
      x: MARGEM,
      y: 102,
      size: 9,
      font: regular,
      color: CINZA,
    });
  }

  return pdfDoc.save();
}

/* ------------------------------------------------------------------ arte */

/**
 * As quatro quinas angulares do modelo.
 *
 * `drawSvgPath` ancora o caminho no ponto dado e conta o eixo Y para baixo —
 * o contrário do resto da página. Por isso cada bloco recebe a âncora que
 * torna suas coordenadas positivas, em vez de um sistema único.
 */
function desenharQuinas(page: PDFPage) {
  // Superior esquerda: duas cunhas sobrepostas, a escura mais estreita e alta.
  page.drawSvgPath("M 0 0 L 214 0 L 0 98 Z", {
    x: 0,
    y: ALTURA,
    color: LARANJA,
    borderWidth: 0,
  });
  page.drawSvgPath("M 0 0 L 106 0 L 0 152 Z", {
    x: 0,
    y: ALTURA,
    color: LARANJA_ESCURO,
    borderWidth: 0,
  });

  // Superior direita: acento pequeno, para não disputar com o logo.
  page.drawSvgPath("M 0 0 L -80 0 L 0 50 Z", {
    x: LARGURA,
    y: ALTURA,
    color: LARANJA_CLARO,
    borderWidth: 0,
  });

  // Inferior direita: espelha a superior esquerda e equilibra a página.
  page.drawSvgPath("M 0 0 L 0 120 L -236 120 Z", {
    x: LARGURA,
    y: 120,
    color: LARANJA,
    borderWidth: 0,
  });
  page.drawSvgPath("M 0 0 L 0 164 L -112 164 Z", {
    x: LARGURA,
    y: 164,
    color: LARANJA_ESCURO,
    borderWidth: 0,
  });

  // Inferior esquerda: acento pequeno, abaixo do bloco de conferência.
  page.drawSvgPath("M 0 0 L 0 46 L 76 46 Z", {
    x: 0,
    y: 46,
    color: LARANJA_CLARO,
    borderWidth: 0,
  });
}

/**
 * A marca, no lugar que o modelo reserva a ela (alto, à direita).
 *
 * Falhando a leitura do arquivo, o certificado sai sem o logo em vez de não
 * sair: quem concluiu o curso tem direito ao documento, e um caminho de
 * arquivo errado no servidor não é motivo para negá-lo.
 */
async function desenharLogo(pdfDoc: PDFDocument, page: PDFPage) {
  try {
    const arquivo = path.join(process.cwd(), "public", "brand", "logo-tri-hoteis.png");
    const png = await pdfDoc.embedPng(await readFile(arquivo));

    const lado = 104;
    page.drawImage(png, {
      x: LARGURA - MARGEM - lado,
      y: ALTURA - 62 - lado,
      width: lado,
      height: lado,
    });
  } catch {
    // sem logo, o resto do certificado continua válido
  }
}

/** Selo comemorativo — equivalente à medalha do modelo. */
function desenharSelo(page: PDFPage) {
  const cx = LARGURA - MARGEM - 52;
  const cy = 300;

  // Fitas, atrás do disco.
  page.drawSvgPath("M 0 0 L 22 0 L 30 74 L 11 60 L -8 74 Z", {
    x: cx - 11,
    y: cy + 4,
    color: LARANJA_ESCURO,
    borderWidth: 0,
  });

  page.drawCircle({ x: cx, y: cy, size: 44, color: LARANJA_ESCURO });
  page.drawCircle({ x: cx, y: cy, size: 38, color: LARANJA });
  page.drawCircle({ x: cx, y: cy, size: 29, color: BRANCO });
  page.drawCircle({ x: cx, y: cy, size: 25, color: LARANJA_CLARO });
}

/* --------------------------------------------------------------- tipografia */

type EstiloTexto = {
  x?: number;
  y: number;
  size: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
};

/**
 * Reduz o corpo até o texto caber na largura disponível.
 *
 * Nome de aluno e título de curso vêm de cadastro livre: sem isto, um título
 * longo atravessaria o selo e sairia pela borda do papel.
 */
function ajustarCorpo(texto: string, font: PDFFont, inicial: number, limite: number) {
  let corpo = inicial;
  while (corpo > 10 && font.widthOfTextAtSize(texto, corpo) > limite) corpo -= 0.5;
  return corpo;
}

/** Texto com espaçamento entre letras — o pdf-lib não tem tracking próprio. */
function escreverEspacado(
  page: PDFPage,
  texto: string,
  estilo: EstiloTexto & { espaco: number }
) {
  const { x = 0, y, size, font, color, espaco } = estilo;
  let cursor = x;

  for (const letra of texto) {
    page.drawText(letra, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(letra, size) + espaco;
  }
}

/** Centraliza um texto entre dois pontos — usado sob a linha de assinatura. */
function centralizarEm(
  page: PDFPage,
  texto: string,
  inicio: number,
  fim: number,
  estilo: EstiloTexto
) {
  const largura = estilo.font.widthOfTextAtSize(texto, estilo.size);
  page.drawText(texto, { ...estilo, x: inicio + (fim - inicio - largura) / 2 });
}
