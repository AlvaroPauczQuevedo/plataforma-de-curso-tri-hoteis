import Link from "next/link";
import { Plus, FileQuestion } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ProvasPage() {
  await requireAdmin();

  /*
    A lista não filtra por departamento, como a de cursos: administrador vê
    tudo e altera só o seu. Ver o que existe evita criar a mesma prova duas
    vezes em setores diferentes.
  */
  const provas = await db.prova.findMany({
    include: {
      department: true,
      _count: { select: { questoes: true, tentativas: true } },
    },
    orderBy: [{ publicada: "desc" }, { titulo: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Provas</h1>
          <p className="text-sm text-ink-700/70">
            {provas.length} prova(s) cadastrada(s). Avaliação de conhecimento, com
            correção automática.
          </p>
        </div>
        <ButtonLink href="/admin/provas/nova">
          <Plus className="h-4 w-4" />
          Nova prova
        </ButtonLink>
      </div>

      {provas.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="Nenhuma prova cadastrada"
          description="Crie uma prova para avaliar o que a equipe aprendeu. A correção é automática e a nota fica registrada."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-700/50">
                <th className="px-4 py-3 font-medium">Prova</th>
                <th className="px-4 py-3 font-medium">Departamento</th>
                <th className="px-4 py-3 font-medium">Questões</th>
                <th className="px-4 py-3 font-medium">Nota mínima</th>
                <th className="px-4 py-3 font-medium">Realizações</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {provas.map((p) => (
                <tr key={p.id} className="transition hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-900">{p.titulo}</span>
                    {p.descricao && (
                      <p className="truncate text-xs text-ink-700/50">{p.descricao}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-700/70">
                    {p.department?.name ?? "Geral"}
                  </td>
                  <td className="px-4 py-3 text-ink-700/70">{p._count.questoes}</td>
                  <td className="px-4 py-3 text-ink-700/70">{p.notaMinima}%</td>
                  <td className="px-4 py-3 text-ink-700/70">{p._count.tentativas}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.publicada ? "success" : "warning"}>
                      {p.publicada ? "Publicada" : "Rascunho"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/provas/${p.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
