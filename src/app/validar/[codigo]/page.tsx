import { db } from "@/lib/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

/**
 * Conferência pública de certificado.
 *
 * Um certificado que ninguém de fora consegue conferir vale pouco: auditor,
 * cliente ou futuro empregador só têm o PDF, que qualquer editor de imagem
 * reproduz. Aqui o código impresso no certificado é conferido contra o banco.
 *
 * A página é pública de propósito — é isso que a torna útil. O que se mostra é
 * o mínimo para confirmar a autenticidade: nome, curso e data. Sem e-mail, sem
 * matrícula, sem cargo, sem nota. E não há listagem nem busca: só se confere um
 * código que a pessoa já tem em mãos, então nada aqui permite varrer a base.
 */
export const dynamic = "force-dynamic";

export default async function ValidarCertificadoPage(
  props: {
    params: Promise<{ codigo: string }>;
  }
) {
  const params = await props.params;
  const codigo = decodeURIComponent(params.codigo).trim().toUpperCase();

  const certificado = await db.certificate.findUnique({
    where: { code: codigo },
    select: {
      code: true,
      issuedAt: true,
      user: { select: { name: true } },
      course: { select: { title: true, durationMinutes: true } },
    },
  });

  if (!certificado) {
    return (
      <AuthShell
        title="Certificado não encontrado"
        subtitle="Nenhum certificado corresponde a este código."
      >
        <div className="space-y-4 text-sm text-ink-700/70">
          <p>
            Confira se o código foi digitado exatamente como aparece no certificado,
            incluindo os hífens.
          </p>
          <p className="rounded-xl bg-surface-muted/60 p-3 font-mono text-xs break-all">
            {codigo}
          </p>
          <p>
            Persistindo, procure o setor de treinamento da Tri Hotéis para confirmar
            o documento.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Certificado autêntico"
      subtitle="Este documento consta nos registros da Academia Corporativa Tri Hotéis."
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <Badge tone="success">Verificado</Badge>
        </div>

        <dl className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-700/50">Concluído por</dt>
            <dd className="font-medium text-ink-900">{certificado.user.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-700/50">Curso</dt>
            <dd className="font-medium text-ink-900">{certificado.course.title}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-700/50">Emitido em</dt>
            <dd className="text-ink-900">{formatDate(certificado.issuedAt)}</dd>
          </div>
          {certificado.course.durationMinutes > 0 && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-700/50">Carga horária</dt>
              <dd className="text-ink-900">
                {Math.round(certificado.course.durationMinutes / 60)} hora(s)
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-700/50">Código</dt>
            <dd className="font-mono text-xs break-all text-ink-700">{certificado.code}</dd>
          </div>
        </dl>
      </div>
    </AuthShell>
  );
}
