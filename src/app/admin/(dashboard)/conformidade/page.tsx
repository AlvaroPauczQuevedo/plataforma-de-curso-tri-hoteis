import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SearchInput, SelectFilter, Pagination } from "@/components/admin/table-filters";
import { formatDate } from "@/lib/utils";
import { levantarObrigacoes } from "@/lib/conformidade";

const PAGE_SIZE = 25;

/**
 * Conformidade: quem deve o quê.
 *
 * Os relatórios existentes respondem "como vai o curso X" e "como vai o
 * departamento Y". Esta tela responde a pergunta que auditoria e RH fazem, que
 * é outra: **nome a nome, quem está em dia e quem está atrasado**.
 *
 * Só matrículas obrigatórias entram. Curso opcional não é dívida de ninguém, e
 * misturá-lo aqui inflaria o número de pendências até o relatório virar ruído.
 */
export default async function ConformidadePage(
  props: {
    searchParams: Promise<{
      q?: string;
      departamento?: string;
      situacao?: string;
      page?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireAdmin();

  const page = Math.max(1, Number(searchParams.page ?? 1));

  /*
    A conta vive em lib/conformidade, e não aqui, porque o resumo semanal por
    e-mail precisa da MESMA. Duas cópias acabariam discordando, e a divergência
    apareceria do pior jeito: a tela dizendo doze atrasados e o e-mail dizendo
    nove, sem ninguém saber qual vale.
  */
  const [{ linhas, resumo }, departamentos] = await Promise.all([
    levantarObrigacoes({
      q: searchParams.q,
      departamentoId: searchParams.departamento,
    }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  const filtradas = searchParams.situacao
    ? linhas.filter((l) => l.situacao === searchParams.situacao)
    : linhas;

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pagina = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /*
    Só agora, e só para o que está em tela, os dados de exibição. Duas
    consultas de tamanho fixo, em vez de um include proporcional à base.
  */
  const [usuariosDaPagina, cursosDaPagina] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(pagina.map((l) => l.userId))] } },
      select: {
        id: true,
        name: true,
        email: true,
        department: { select: { name: true } },
      },
    }),
    db.course.findMany({
      where: { id: { in: [...new Set(pagina.map((l) => l.courseId))] } },
      select: { id: true, title: true },
    }),
  ]);

  const usuarioPor = new Map(usuariosDaPagina.map((u) => [u.id, u]));
  const cursoPor = new Map(cursosDaPagina.map((c) => [c.id, c]));

  const linhasDaPagina = pagina.map((l) => ({
    ...l,
    user: usuarioPor.get(l.userId),
    course: cursoPor.get(l.courseId),
  }));

  const selo = {
    em_dia: <Badge tone="success">Em dia</Badge>,
    pendente: <Badge tone="neutral">Pendente</Badge>,
    vencendo: <Badge tone="warning">Vence em breve</Badge>,
    atrasado: <Badge tone="danger">Atrasado</Badge>,
  };

  const cartoes = [
    { rotulo: "Atrasados", valor: resumo.atrasado, cor: "text-danger-600" },
    { rotulo: "Vencendo em 7 dias", valor: resumo.vencendo, cor: "text-warning-600" },
    { rotulo: "Pendentes", valor: resumo.pendente, cor: "text-ink-900" },
    { rotulo: "Em dia", valor: resumo.em_dia, cor: "text-success-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Conformidade</h1>
        <p className="text-sm text-ink-700/70">
          Treinamentos obrigatórios, nome a nome. {resumo.total} obrigação(ões) no total.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-2xl border border-border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-700/60">{c.rotulo}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.cor}`}>{c.valor}</p>
          </div>
        ))}
      </div>

      <Suspense>
        <div className="flex flex-wrap gap-3">
          <SearchInput placeholder="Buscar por nome ou e-mail" />
          <SelectFilter
            paramKey="departamento"
            placeholder="Todos os departamentos"
            options={departamentos.map((d) => ({ value: d.id, label: d.name }))}
          />
          <SelectFilter
            paramKey="situacao"
            placeholder="Todas as situações"
            options={[
              { value: "atrasado", label: "Atrasado" },
              { value: "vencendo", label: "Vence em breve" },
              { value: "pendente", label: "Pendente" },
              { value: "em_dia", label: "Em dia" },
            ]}
          />
        </div>
      </Suspense>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhuma obrigação encontrada"
          description="Marque cursos como obrigatórios na tela do curso para que apareçam aqui."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Funcionário</th>
                  <th className="px-4 py-3 font-medium">Departamento</th>
                  <th className="px-4 py-3 font-medium">Curso</th>
                  <th className="px-4 py-3 font-medium">Progresso</th>
                  <th className="px-4 py-3 font-medium">Prazo</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhasDaPagina.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/funcionarios/${l.userId}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {l.user?.name ?? "—"}
                      </Link>
                      <p className="text-xs text-ink-700/50">{l.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {l.user?.department?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/cursos/${l.courseId}`}
                        className="text-ink-700 hover:text-brand-700"
                      >
                        {l.course?.title ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar percent={l.percent} size="sm" className="w-20" />
                        <span className="text-xs tabular-nums text-ink-700/60">
                          {l.percent}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-700/60">
                      {l.dueDate ? (
                        <>
                          {formatDate(l.dueDate)}
                          {!l.concluido && l.diasRestantes !== null && (
                            <span
                              className={
                                l.diasRestantes < 0 ? "block text-danger-600" : "block"
                              }
                            >
                              {l.diasRestantes < 0
                                ? `${Math.abs(l.diasRestantes)} dia(s) em atraso`
                                : `faltam ${l.diasRestantes} dia(s)`}
                            </span>
                          )}
                        </>
                      ) : (
                        "sem prazo"
                      )}
                    </td>
                    <td className="px-4 py-3">{selo[l.situacao as keyof typeof selo]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} />
        </div>
      )}
    </div>
  );
}
