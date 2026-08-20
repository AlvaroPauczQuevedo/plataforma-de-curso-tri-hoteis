import { Award, Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function CertificadosPage() {
  const user = await requireUser();

  const certificates = await db.certificate.findMany({
    where: { userId: user.id },
    include: { course: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Certificados</h1>
        <p className="text-sm text-navy-700/70">
          Certificados emitidos automaticamente ao concluir 100% de um curso com certificação habilitada.
        </p>
      </div>

      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="Nenhum certificado ainda"
          description="Conclua um curso com certificação habilitada para receber seu certificado aqui."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-sm"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-accent-600 to-electric-500">
                <Award className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-navy-900">{cert.course.title}</p>
                <p className="text-xs text-navy-700/60">
                  Emitido em {formatDate(cert.issuedAt)} · Código {cert.code}
                </p>
              </div>
              <ButtonLink href={`/api/certificados/${cert.id}/pdf`} variant="outline" size="sm">
                <Download className="h-4 w-4" />
                Baixar PDF
              </ButtonLink>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
