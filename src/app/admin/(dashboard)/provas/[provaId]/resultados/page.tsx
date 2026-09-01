import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { carregarAtorOuFalhar } from "@/lib/alcance-admin";
import { motivoDeBloqueioDeProva } from "@/lib/permissoes-usuario";
import { estatisticasDaProva, type QuestaoCorrigida } from "@/lib/prova";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

/**
 * Resultados de uma prova.
 *
 * Responde três perguntas que a lista de provas não responde: quem já passou,
 * quanto a turma acerta e — a mais útil — quais questões o pessoal erra.
 *
 * A última é a que fecha o ciclo do treinamento. Uma questão que quase todo
 * mundo erra significa que o curso não cobriu aquilo, ou que o enunciado está
 * ambíguo. Nos dois casos o que precisa mudar é o material, não a nota.
 */
export default async function ResultadosDaProvaPage({
  params,
}: {
  params: { provaId: string };
}) {
  const admin = await requireAdmin();
  const ator = await carregarAtorOuFalhar(admin.id);

  const prova = await db.prova.findUnique({
    where: { id: params.provaId },
    include: {
      tentativas: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!prova) notFound();
  if (motivoDeBloqueioDeProva(prova, ator)) notFound();

  const estatistica = estatisticasDaProva(
    prova.tentativas.map((t) => ({
      userId: t.userId,
      nome: t.user.name,
      nota: t.nota,
      aprovado: t.aprovado,
      quando: t.createdAt,
      questoes: analisarRespostas(t.respostas),
    }))
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/provas/${prova.id}`}
        className="inline-flex items-center gap-1 text-sm text-ink-700/60 hover:text-ink-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para a prova
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{prova.titulo}</h1>
        <p className="text-sm text-ink-700/70">
          Resultados · nota mínima {prova.notaMinima}%
        </p>
      </div>

      {prova.tentativas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Ninguém realizou esta prova ainda"
          description="Os resultados aparecem aqui na primeira entrega."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Indicador titulo="Pessoas" valor={String(estatistica.pessoas.length)} />
            <Indicador
              titulo="Aprovadas"
              valor={`${estatistica.taxaDeAprovacao}%`}
            />
            <Indicador
              titulo="Média (melhor nota)"
              valor={`${estatistica.mediaDasMelhores}%`}
            />
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold text-ink-900">Questões mais erradas</h2>
              <p className="text-sm text-ink-700/70">
                Contando todas as tentativas. Índice alto costuma ser material
                que faltou no curso, ou enunciado ambíguo.
              </p>
            </div>

            <ul className="space-y-2">
              {estatistica.questoes.map((q) => (
                <li
                  key={q.questaoId}
                  className="rounded-2xl border border-border bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-ink-900">{q.enunciado}</p>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                        q.percentualDeErro >= 50
                          ? "bg-red-50 text-red-700"
                          : "bg-surface-muted text-ink-700"
                      }`}
                    >
                      {q.percentualDeErro}% de erro
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-700/50">
                    {q.erros} erro(s) em {q.respostas} resposta(s)
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold text-ink-900">Por pessoa</h2>
              <p className="text-sm text-ink-700/70">
                Vale a melhor nota: refazer a prova é permitido, e o que
                interessa é o que a pessoa sabe agora.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Funcionário</th>
                    <th className="px-4 py-3 font-medium">Tentativas</th>
                    <th className="px-4 py-3 font-medium">Melhor nota</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                    <th className="px-4 py-3 font-medium">Última</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {estatistica.pessoas.map((p) => (
                    <tr key={p.userId}>
                      <td className="px-4 py-3 text-ink-900">{p.nome}</td>
                      <td className="px-4 py-3 text-ink-700/70">{p.tentativas}</td>
                      <td className="px-4 py-3 font-medium text-ink-900">
                        {p.melhorNota}%
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={p.aprovado ? "success" : "danger"}>
                          {p.aprovado ? "Aprovado" : "Reprovado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-700/50">
                        {formatDateTime(p.ultima)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-ink-700/50">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{valor}</p>
    </div>
  );
}

/**
 * O gabarito congelado da tentativa, guardado como JSON.
 *
 * Tentativa antiga ou gravação interrompida pode não ter o formato esperado.
 * Nesse caso ela some da estatística por questão, mas continua contando na
 * nota da pessoa — perder uma linha do relatório é aceitável; derrubar a tela
 * de resultados por causa de um registro velho, não.
 */
function analisarRespostas(bruto: string): QuestaoCorrigida[] {
  try {
    const lido = JSON.parse(bruto);
    return Array.isArray(lido) ? (lido as QuestaoCorrigida[]) : [];
  } catch {
    return [];
  }
}
