import Link from "next/link";
import { FileQuestion, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";

/** Quantas notas o funcionário vê. Pedido do negócio, não limite técnico. */
const ULTIMAS = 3;

export default async function ProvasPage() {
  const user = await requireUser();

  const conta = await db.user.findUnique({
    where: { id: user.id },
    select: { departmentId: true },
  });

  /*
    O funcionário alcança as provas publicadas do departamento dele e as provas
    gerais — as que não têm departamento, escritas para a empresa toda.
  */
  const provas = await db.prova.findMany({
    where: {
      publicada: true,
      OR: [{ departmentId: null }, { departmentId: conta?.departmentId ?? "" }],
    },
    include: {
      department: true,
      _count: { select: { questoes: true } },
      tentativas: {
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { titulo: "asc" },
  });

  const ultimasNotas = await db.tentativaProva.findMany({
    where: { userId: user.id },
    include: { prova: { select: { titulo: true } } },
    orderBy: { createdAt: "desc" },
    take: ULTIMAS,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Provas</h1>
        <p className="text-sm text-ink-700/70">
          Avaliações liberadas para você. A correção é automática e a nota aparece
          na hora.
        </p>
      </div>

      {ultimasNotas.length > 0 && (
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-3 font-semibold text-ink-900">
            Suas últimas {ULTIMAS} provas realizadas
          </h2>
          <ul className="divide-y divide-border">
            {ultimasNotas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                  {t.prova.titulo}
                </span>
                <span className="text-xs text-ink-700/50">
                  {formatDateTime(t.createdAt)}
                </span>
                <span className="text-sm font-semibold text-ink-900">
                  {t.nota}%
                </span>
                <Badge tone={t.aprovado ? "success" : "danger"}>
                  {t.aprovado ? "Aprovado" : "Reprovado"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {provas.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="Nenhuma prova disponível"
          description="Quando houver uma avaliação liberada para o seu departamento, ela aparece aqui."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {provas.map((p) => {
            const ultima = p.tentativas[0];

            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5"
              >
                <div>
                  <h3 className="font-semibold text-ink-900">{p.titulo}</h3>
                  {p.descricao && (
                    <p className="mt-1 text-sm text-ink-700/70">{p.descricao}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-700/60">
                  <span>{p._count.questoes} questão(ões)</span>
                  <span>·</span>
                  <span>mínimo {p.notaMinima}%</span>
                  <span>·</span>
                  <span>{p.department?.name ?? "Geral"}</span>
                </div>

                {ultima && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-ink-700/70">Sua última nota:</span>
                    <span className="font-semibold text-ink-900">{ultima.nota}%</span>
                    <Badge tone={ultima.aprovado ? "success" : "danger"}>
                      {ultima.aprovado ? "Aprovado" : "Reprovado"}
                    </Badge>
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link
                    href={`/provas/${p.id}`}
                    className="rounded-xl bg-brand-700 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-800"
                  >
                    {ultima ? "Refazer prova" : "Fazer prova"}
                  </Link>
                  <a
                    href={`/api/provas/${p.id}/pdf`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-surface-muted"
                  >
                    <Download className="h-4 w-4" />
                    Baixar em PDF
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
