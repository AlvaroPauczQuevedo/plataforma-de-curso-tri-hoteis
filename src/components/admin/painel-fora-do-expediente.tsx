import Link from "next/link";
import { Clock } from "lucide-react";
import { levantarEstudoForaDeHora } from "@/lib/horario-de-trabalho";
import { formatDateTime } from "@/lib/utils";

/**
 * Quem fez treinamento obrigatório fora do horário de trabalho.
 *
 * Treinamento obrigatório é tempo à disposição do empregador, e a plataforma
 * registra quando cada pessoa estudou com precisão de segundos. Este painel
 * existe para o RH **corrigir antes de virar passivo** — uma conversa com o
 * gestor resolve o que uma reclamação trabalhista cobraria depois.
 *
 * ---
 *
 * **É uma lista de conferência, não de violações.** O texto diz isso, e não é
 * delicadeza: num hotel tem gente trabalhando às três da manhã. A recepção da
 * madrugada que estuda no horário dela está dentro do próprio expediente, e vai
 * aparecer aqui — a plataforma não conhece a escala de ninguém.
 *
 * Apresentá-la como lista de irregularidades faria o RH cobrar exatamente quem
 * está certo, e o painel viraria fonte de injustiça em vez de proteção.
 *
 * Some quando não há nada: um painel sempre presente com "nenhum registro" vira
 * paisagem, e deixa de ser notado no dia em que tiver conteúdo.
 */
export async function PainelForaDoExpediente() {
  const { linhas, janela, desde } = await levantarEstudoForaDeHora();

  if (linhas.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-warning-600/30 bg-surface">
      <div className="flex items-start gap-3 border-b border-border bg-warning-100/40 px-5 py-4">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />
        <div>
          <h2 className="font-semibold text-ink-900">
            Treinamento obrigatório fora do horário
          </h2>
          <p className="mt-0.5 text-sm text-ink-700/80">
            {linhas.length} pessoa(s) desde {formatDateTime(desde)}. O horário previsto é{" "}
            {janela}.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
            <tr>
              <th className="px-5 py-3 font-medium">Funcionário</th>
              <th className="px-5 py-3 font-medium">Ocorrências</th>
              <th className="px-5 py-3 font-medium">Última</th>
              <th className="px-5 py-3 font-medium">Treinamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((l) => (
              <tr key={l.userId} className="hover:bg-surface-muted/40">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/funcionarios/${l.userId}`}
                    className="font-medium text-ink-900 hover:text-brand-texto"
                  >
                    {l.nome}
                  </Link>
                </td>
                <td className="px-5 py-3 tabular-nums text-ink-700">{l.ocorrencias}</td>
                <td className="px-5 py-3 text-xs text-ink-700/70">{formatDateTime(l.ultima)}</td>
                <td className="px-5 py-3 text-xs text-ink-700/70">{l.cursos.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-ink-700/60">
        <strong className="font-medium text-ink-800">Isto é uma lista para conferir, não
        para cobrar.</strong>{" "}
        Quem trabalha em turno da noite ou de domingo aparece aqui estando certo — a
        plataforma não conhece a escala. O que vale olhar é o padrão: alguém que estuda
        de madrugada toda semana provavelmente está fazendo treinamento obrigatório fora
        da jornada, e isso é tempo à disposição da empresa.
      </p>
    </section>
  );
}
