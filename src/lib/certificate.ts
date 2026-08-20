import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatDate } from "@/lib/utils";

export async function generateCertificatePdf(params: {
  employeeName: string;
  courseTitle: string;
  durationMinutes: number;
  issuedAt: Date;
  code: string;
}) {
  const { employeeName, courseTitle, durationMinutes, issuedAt, code } = params;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 paisagem
  const { width, height } = page.getSize();

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Identidade Tri Hotéis: grafite quente + laranja da marca (#FF6A00)
  const navy = rgb(0.11, 0.1, 0.09);
  const accent = rgb(1, 0.416, 0);
  const gray = rgb(0.34, 0.32, 0.31);

  // moldura
  page.drawRectangle({
    x: 20,
    y: 20,
    width: width - 40,
    height: height - 40,
    borderColor: accent,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: 30,
    y: 30,
    width: width - 60,
    height: height - 60,
    borderColor: navy,
    borderWidth: 1,
  });

  const centerText = (
    text: string,
    y: number,
    font = regular,
    size = 14,
    color = navy
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y,
      size,
      font,
      color,
    });
  };

  centerText("ACADEMIA CORPORATIVA TRI HOTÉIS", height - 100, bold, 16, accent);
  centerText("CERTIFICADO DE CONCLUSÃO", height - 140, bold, 30, navy);

  centerText("Certificamos que", height - 210, regular, 14, gray);
  centerText(employeeName, height - 245, bold, 26, navy);

  centerText(
    "concluiu com êxito o curso de treinamento corporativo",
    height - 285,
    regular,
    14,
    gray
  );
  centerText(courseTitle, height - 320, bold, 20, accent);

  const hours = Math.round((durationMinutes / 60) * 10) / 10;
  centerText(
    `Carga horária: ${hours > 0 ? hours : durationMinutes / 60} hora(s) — Concluído em ${formatDate(issuedAt)}`,
    height - 360,
    regular,
    12,
    gray
  );

  centerText(`Código de verificação: ${code}`, 70, regular, 10, gray);

  return pdfDoc.save();
}
