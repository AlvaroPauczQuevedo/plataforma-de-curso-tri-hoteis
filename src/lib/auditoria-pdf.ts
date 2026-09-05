/**
 * O relatório de auditoria em PDF.
 *
 * É o papel que se entrega e se assina, então segue as regras de um documento
 * e não de uma tela: cabeçalho repetido em toda página, numeração, e a data de
 * geração visível — um relatório sem data não prova nada seis meses depois.
 *
 * Cada linha traz o CÓDIGO do certificado. É o que separa este documento de
 * uma afirmação: quem recebe confere qualquer linha em `/validar`, sem login,
 * e vê a mesma informação saindo da fonte.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { RelatorioDeAuditoria } from "@/lib/auditoria";
import { formatDateTime } from "@/lib/utils";

const LARANJA = rgb(1, 0.416, 0);
const GRAFITE = rgb(0.11, 0.098, 0.09);
const CINZA = rgb(0.4, 0.38, 0.36);
const VERMELHO = rgb(0.75, 0.16, 0.16);
const PAPEL = rgb(1, 1, 1);
const BORDA = rgb(0.85, 0.83, 0.81);

const L = 595; // A4 retrato
const A = 842;
const MARGEM = 45;
const UTIL = L - MARGEM * 2;
const RODAPE = 55;

const ROTULO: Record<string, string> = {
  concluido: "Concluído",
  vencido: "VENCIDO",
  pendente: "Pendente",
  atrasado: "ATRASADO",
};

function data(d: Date | null): string {
  if (!d) return "—";
  // UTC: as datas aqui são instantes gravados pelo servidor, e o relatório é
  // conferido contra a tela, que usa o mesmo critério em `formatPrazo`.
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function cortar(texto: string, fonte: PDFFont, corpo: number, largura: number): string {
  if (fonte.widthOfTextAtSize(texto, corpo) <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && fonte.widthOfTextAtSize(`${corte}...`, corpo) > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}...`;
}

export async function gerarAuditoriaPdf(relatorio: RelatorioDeAuditoria): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let page: PDFPage;
  let y = 0;

  // Pelo formatador das telas: ele já resolve o fuso de exibição, e um
  // relatório com hora diferente da que aparece no sistema levanta a dúvida
  // errada em quem confere.
  const geradoTexto = `Gerado em ${formatDateTime(relatorio.geradoEm)}`;

  function novaPagina() {
    page = doc.addPage([L, A]);
    page.drawRectangle({ x: 0, y: 0, width: L, height: A, color: PAPEL });

    page.drawRectangle({ x: 0, y: A - 6, width: L, height: 6, color: LARANJA });

    page.drawText("Relatório de treinamentos obrigatórios", {
      x: MARGEM,
      y: A - 44,
      size: 15,
      font: bold,
      color: GRAFITE,
    });
    page.drawText("Academia Corporativa Tri Hotéis", {
      x: MARGEM,
      y: A - 60,
      size: 9,
      font: regular,
      color: CINZA,
    });

    const escopo = relatorio.departamentoFiltrado
      ? `Departamento: ${relatorio.departamentoFiltrado}`
      : "Todos os departamentos";
    page.drawText(escopo, { x: MARGEM, y: A - 74, size: 9, font: regular, color: CINZA });

    const larguraGerado = regular.widthOfTextAtSize(geradoTexto, 9);
    page.drawText(geradoTexto, {
      x: L - MARGEM - larguraGerado,
      y: A - 74,
      size: 9,
      font: regular,
      color: CINZA,
    });

    page.drawLine({
      start: { x: MARGEM, y: A - 84 },
      end: { x: L - MARGEM, y: A - 84 },
      thickness: 0.7,
      color: BORDA,
    });

    y = A - 108;
  }

  /** Garante espaço; abre página nova quando não cabe. */
  function reservar(altura: number) {
    if (y - altura < RODAPE) novaPagina();
  }

  novaPagina();

  // ------------------------------------------------------------- resumo
  const pendentes = relatorio.total - relatorio.regulares;
  page!.drawText(
    `${relatorio.total} vínculo(s) de treinamento obrigatório · ${relatorio.regulares} regular(es) · ${pendentes} pendente(s)`,
    { x: MARGEM, y, size: 10, font: bold, color: pendentes > 0 ? VERMELHO : GRAFITE }
  );
  y -= 24;

  if (relatorio.blocos.length === 0) {
    page!.drawText(
      "Nenhum curso está marcado como obrigatório para os departamentos deste relatório.",
      { x: MARGEM, y, size: 10, font: regular, color: CINZA }
    );
  }

  // ------------------------------------------------------------- blocos
  for (const bloco of relatorio.blocos) {
    reservar(70);

    page!.drawRectangle({
      x: MARGEM,
      y: y - 4,
      width: UTIL,
      height: 22,
      color: rgb(0.97, 0.96, 0.95),
    });
    page!.drawText(cortar(`${bloco.departamento} — ${bloco.curso}`, bold, 10.5, UTIL - 12), {
      x: MARGEM + 6,
      y: y + 2,
      size: 10.5,
      font: bold,
      color: GRAFITE,
    });
    y -= 30;

    const regra = [
      bloco.prazoDias ? `prazo de ${bloco.prazoDias} dia(s)` : "sem prazo",
      bloco.validadeMeses ? `reciclagem a cada ${bloco.validadeMeses} mês(es)` : "sem reciclagem",
      `${bloco.regulares} de ${bloco.pessoas.length} regular(es)`,
    ].join(" · ");
    page!.drawText(regra, { x: MARGEM + 6, y, size: 8.5, font: regular, color: CINZA });
    y -= 18;

    // Cabeçalho da tabela.
    const colunas = [
      { titulo: "Funcionário", x: MARGEM + 6 },
      { titulo: "Situação", x: MARGEM + 200 },
      { titulo: "Conclusão", x: MARGEM + 268 },
      { titulo: "Vence", x: MARGEM + 330 },
      { titulo: "Código de conferência", x: MARGEM + 388 },
    ];
    for (const c of colunas) {
      page!.drawText(c.titulo, { x: c.x, y, size: 7.5, font: bold, color: CINZA });
    }
    y -= 4;
    page!.drawLine({
      start: { x: MARGEM, y },
      end: { x: L - MARGEM, y },
      thickness: 0.5,
      color: BORDA,
    });
    y -= 12;

    for (const p of bloco.pessoas) {
      reservar(16);

      const irregular = p.situacao === "vencido" || p.situacao === "atrasado";

      page!.drawText(cortar(p.nome, regular, 8.5, 185), {
        x: colunas[0].x,
        y,
        size: 8.5,
        font: regular,
        color: GRAFITE,
      });
      page!.drawText(ROTULO[p.situacao] ?? p.situacao, {
        x: colunas[1].x,
        y,
        size: 8.5,
        font: irregular ? bold : regular,
        color: irregular ? VERMELHO : GRAFITE,
      });
      page!.drawText(data(p.concluidoEm), {
        x: colunas[2].x,
        y,
        size: 8.5,
        font: regular,
        color: CINZA,
      });
      page!.drawText(data(p.venceEm), {
        x: colunas[3].x,
        y,
        size: 8.5,
        font: regular,
        color: CINZA,
      });
      page!.drawText(p.codigo ?? "—", {
        x: colunas[4].x,
        y,
        size: 8,
        font: regular,
        color: CINZA,
      });

      y -= 13;
    }

    y -= 14;
  }

  // -------------------------------------------------------------- rodapé
  const paginas = doc.getPages();
  for (const [i, pagina] of paginas.entries()) {
    const nota =
      "Cada código pode ser conferido publicamente em /validar, sem login. " +
      `Página ${i + 1} de ${paginas.length}.`;
    pagina.drawLine({
      start: { x: MARGEM, y: RODAPE - 8 },
      end: { x: L - MARGEM, y: RODAPE - 8 },
      thickness: 0.5,
      color: BORDA,
    });
    pagina.drawText(cortar(nota, regular, 7.5, UTIL), {
      x: MARGEM,
      y: RODAPE - 22,
      size: 7.5,
      font: regular,
      color: CINZA,
    });
  }

  return doc.save();
}
