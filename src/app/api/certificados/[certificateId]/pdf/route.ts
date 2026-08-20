import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { db } from "@/lib/db";
import { generateCertificatePdf } from "@/lib/certificate";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certificateId: string }> }
) {
  const { certificateId } = await params;

  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const certificate = await db.certificate.findUnique({
    where: { id: certificateId },
    include: { user: true, course: true },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Certificado não encontrado." }, { status: 404 });
  }

  if (certificate.userId !== session.user.id && session.user.role !== "ADMIN") {
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
