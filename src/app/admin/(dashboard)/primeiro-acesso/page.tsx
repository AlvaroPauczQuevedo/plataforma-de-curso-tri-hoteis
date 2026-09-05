import { Suspense } from "react";
import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput, SelectFilter, Pagination } from "@/components/admin/table-filters";
import { levantarPrimeiroAcesso } from "@/lib/primeiro-acesso";

const PAGE_SIZE = 25;

/**
 * Primeiro acesso: a credencial que eu entreguei virou acesso?
 *
 * Nasceu de uma limitação da rede, não de um pedido de relatório: **ninguém
 * tem e-mail**. Não existe lembrete automático para o funcionário, então a
 * única cobrança possível é humana — e depende de alguém saber a quem cobrar.
 *
 * A senha provisória é entregue em papel, uma vez. Sem esta tela, descobrir
 * quem nunca usou exigia abrir a ficha de cada pessoa, uma por uma.
 *
 * É pergunta diferente da Conformidade, que responde "quem está atrasado no
 * que devia". Aqui ninguém deve nada ainda: o problema é anterior, é entrar.
 */
export default async function PrimeiroAcessoPage(props: {
  searchParams: Promise<{
    q?: string;
    departamento?: string;
    situacao?: string;
    page?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  await requireAdmin();

  const page = Math.max(1, Number(searchParams.page ?? 1));

  const [{ linhas, resumo }, departamentos] = await Promise.all([
    levantarPrimeiroAcesso({
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

  // Só agora, e só para o que está em tela, os dados de exibição.
  const usuarios = await db.user.findMany({
    where: { id: { in: [...new Set(pagina.map((l) => l.userId))] } },
    select: {
      id: true,
      name: true,
      username: true,
      department: { select: { name: true } },
    },
  });
  const usuarioPor = new Map(usuarios.map((u) => [u.id, u]));

  const selo = {
    nunca_entrou: <Badge tone="danger">Nunca entrou</Badge>,
    sem_curso: <Badge tone="warning">Sem curso</Badge>,
    entrou_sem_comecar: <Badge tone="neutral">Entrou, não começou</Badge>,
    ativo: <Badge tone="success">Ativo</Badge>,
  };

  const cartoes = [
    { rotulo: "Nunca entraram", valor: resumo.nunca_entrou, cor: "text-danger-600" },
    { rotulo: "Sem curso atribuído", valor: resumo.sem_curso, cor: "text-warning-600" },
    { rotulo: "Entraram, não começaram", valor: resumo.entrou_sem_comecar, cor: "text-ink-900" },
    { rotulo: "Ativos", valor: resumo.ativo, cor: "text-success-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Primeiro acesso</h1>
        <p className="text-sm text-ink-700/70">
          Quem recebeu senha e ainda não entrou. {resumo.total} funcionário(s) ativo(s).
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

      {resumo.sem_curso > 0 && (
        <p className="rounded-xl border border-warning-600/20 bg-warning-100 px-4 py-3 text-sm text-warning-600">
          {resumo.sem_curso} pessoa(s) sem nenhum curso atribuído. Não adianta cobrar: não
          há o que começar. Matricule em <Link href="/admin/matriculas" className="underline">Matrículas</Link>{" "}
          ou marque um curso como obrigatório para o departamento delas.
        </p>
      )}

      <Suspense>
        <div className="flex flex-wrap gap-3">
          <SearchInput placeholder="Buscar por nome ou usuário" />
          <SelectFilter
            paramKey="departamento"
            placeholder="Todos os departamentos"
            options={departamentos.map((d) => ({ value: d.id, label: d.name }))}
          />
          <SelectFilter
            paramKey="situacao"
            placeholder="Todas as situações"
            options={[
              { value: "nunca_entrou", label: "Nunca entrou" },
              { value: "sem_curso", label: "Sem curso" },
              { value: "entrou_sem_comecar", label: "Entrou, não começou" },
              { value: "ativo", label: "Ativo" },
            ]}
          />
        </div>
      </Suspense>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="Nenhum funcionário encontrado"
          description="Cadastre funcionários para acompanhar aqui quem já usou a senha entregue."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Funcionário</th>
                  <th className="px-4 py-3 font-medium">Departamento</th>
                  <th className="px-4 py-3 font-medium">Cadastrado há</th>
                  <th className="px-4 py-3 font-medium">Último acesso</th>
                  <th className="px-4 py-3 font-medium">Aulas concluídas</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagina.map((l) => {
                  const user = usuarioPor.get(l.userId);
                  return (
                    <tr key={l.userId} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/funcionarios/${l.userId}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {user?.name ?? "—"}
                        </Link>
                        <p className="font-mono text-xs text-ink-700/50">{user?.username}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-700">
                        {user?.department?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-ink-700/60">
                        {l.diasDesdeCadastro === 0
                          ? "hoje"
                          : `${l.diasDesdeCadastro} dia(s)`}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">
                        {l.diasDesdeUltimoAcesso === null ? (
                          <span className="text-danger-600">nunca</span>
                        ) : l.diasDesdeUltimoAcesso === 0 ? (
                          <span className="text-ink-700/60">hoje</span>
                        ) : (
                          <span className="text-ink-700/60">
                            há {l.diasDesdeUltimoAcesso} dia(s)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-ink-700/60">
                        {l.aulasConcluidas} de {l.matriculas} curso(s)
                      </td>
                      <td className="px-4 py-3">{selo[l.situacao]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} />
        </div>
      )}
    </div>
  );
}
