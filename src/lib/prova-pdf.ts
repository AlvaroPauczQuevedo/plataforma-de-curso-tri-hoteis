/**
 * Versão impressa da prova.
 *
 * SEM GABARITO, sempre. O arquivo é baixado pelo funcionário, e marcar a
 * resposta certa aqui transformaria o download em cola. Serve para estudar o
 * conteúdo, imprimir e aplicar no papel — não para conferir respostas.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const LARANJA = rgb(1, 0.416, 0);
const LARANJA_ESCURO = rgb(0.8, 0.29, 0);
const GRAFITE = rgb(0.11, 0.098, 0.09);
const CINZA = rgb(0.267, 0.251, 0.235);
const PAPEL = rgb(0.98, 0.973, 0.965);
const BORDA = rgb(0.85, 0.83, 0.81);

const L = 595; // A4 retrato
const A = 842;
const MARGEM = 58;
const UTIL = L - MARGEM * 2;

const LETRAS = ["A", "B", "C", "D", "E", "F"];

function quebrar(texto: string, fonte: PDFFont, corpo: number, largura: number) {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(" ")) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(teste, corpo) > largura) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = teste;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

export async function gerarProvaPdf(prova: {
  titulo: string;
  descricao: string | null;
  notaMinima: number;
  departamento: string | null;
  questoes: { enunciado: string; alternativas: { texto: string }[] }[];
}) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page: PDFPage;
  let y = 0;

  const novaPagina = () => {
    page = doc.addPage([L, A]);
    page.drawRectangle({ x: 0, y: 0, width: L, height: A, color: PAPEL });
    page.drawRectangle({ x: 0, y: A - 8, width: L, height: 8, color: LARANJA });
    y = A - 58;
  };

  novaPagina();

  // ---------------------------------------------------------------- cabeçalho
  page!.drawText("ACADEMIA CORPORATIVA TRI HOTÉIS", {
    x: MARGEM, y, size: 8.5, font: bold, color: LARANJA_ESCURO,
  });
  y -= 28;

  page!.drawText(prova.titulo, { x: MARGEM, y, size: 19, font: bold, color: GRAFITE });
  y -= 20;

  const subtitulo = [
    prova.departamento ?? "Geral",
    `${prova.questoes.length} questão(ões)`,
    `nota mínima ${prova.notaMinima}%`,
  ].join(" · ");
  page!.drawText(subtitulo, { x: MARGEM, y, size: 10, font: regular, color: CINZA });
  y -= 18;

  if (prova.descricao) {
    for (const linha of quebrar(prova.descricao, regular, 10, UTIL)) {
      page!.drawText(linha, { x: MARGEM, y, size: 10, font: regular, color: CINZA });
      y -= 13;
    }
  }

  y -= 10;

  /*
    Campos de identificação: sem eles, uma prova impressa e respondida vira uma
    folha anônima. Quem aplica no papel precisa saber de quem é.
  */
  for (const campo of ["Nome:", "Data:"]) {
    page!.drawText(campo, { x: MARGEM, y, size: 10, font: bold, color: GRAFITE });
    const inicio = MARGEM + regular.widthOfTextAtSize(campo, 10) + 8;
    page!.drawLine({
      start: { x: inicio, y: y - 2 },
      end: { x: campo === "Nome:" ? L - MARGEM : MARGEM + 200, y: y - 2 },
      thickness: 0.6,
      color: BORDA,
    });
    y -= 22;
  }

  y -= 8;

  // ----------------------------------------------------------------- questões
  prova.questoes.forEach((questao, indice) => {
    const linhasEnunciado = quebrar(
      `${indice + 1}. ${questao.enunciado}`,
      bold,
      11,
      UTIL
    );
    const alturaNecessaria =
      linhasEnunciado.length * 15 + questao.alternativas.length * 16 + 18;

    if (y - alturaNecessaria < 60) novaPagina();

    for (const linha of linhasEnunciado) {
      page!.drawText(linha, { x: MARGEM, y, size: 11, font: bold, color: GRAFITE });
      y -= 15;
    }
    y -= 3;

    questao.alternativas.forEach((alternativa, i) => {
      if (y < 60) novaPagina();

      // Quadrado para marcar à caneta quando a prova for impressa.
      page!.drawRectangle({
        x: MARGEM + 6, y: y - 1, width: 9, height: 9,
        borderColor: BORDA, borderWidth: 0.8,
      });

      const rotulo = `${LETRAS[i] ?? String(i + 1)})`;
      page!.drawText(rotulo, {
        x: MARGEM + 22, y, size: 10, font: bold, color: CINZA,
      });

      const recuo = MARGEM + 40;
      const linhas = quebrar(alternativa.texto, regular, 10, L - recuo - MARGEM);
      linhas.forEach((linha, j) => {
        page!.drawText(linha, {
          x: recuo, y: y - j * 13, size: 10, font: regular, color: CINZA,
        });
      });
      y -= 16 + (linhas.length - 1) * 13;
    });

    y -= 12;
  });

  // ------------------------------------------------------------------ rodapé
  if (y < 90) novaPagina();
  y -= 6;
  page!.drawText(
    "Esta cópia não traz o gabarito. A correção acontece na plataforma, ao responder pelo portal.",
    { x: MARGEM, y, size: 8.5, font: regular, color: CINZA }
  );

  // A logo é opcional: falhando a leitura, a prova sai sem ela em vez de não sair.
  try {
    const arquivo = path.join(process.cwd(), "public", "brand", "logo-tri-hoteis.png");
    const png = await doc.embedPng(new Uint8Array(await readFile(arquivo)));
    doc.getPage(0).drawImage(png, { x: L - MARGEM - 42, y: A - 96, width: 42, height: 42 });
  } catch {
    // sem logo
  }

  return doc.save();
}
