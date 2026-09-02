import { NextRequest, NextResponse } from "next/server";
import { sessaoDeApi } from "@/lib/session";
import { db } from "@/lib/db";
import { generateCertificatePdf } from "@/lib/certificate";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ certificateId: string }> }
) {
  const params = await props.params;
  const { certificateId } = params;

  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const certificate = await db.certificate.findUnique({
    where: { id: certificateId },
    include: { user: true, course: true },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Certificado não encontrado." }, { status: 404 });
  }

  if (certificate.userId !== usuario.id && usuario.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  const pdfBytes = await generateCertificatePdf({
    employeeName: certificate.user.name,
    courseTitle: certificate.course.title,
    durationMinutes: certificate.course.durationMinutes,
    issuedAt: certificate.issuedAt,
    code: certificate.code,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado-${certificate.code}.pdf"`,
    },
  });
}
