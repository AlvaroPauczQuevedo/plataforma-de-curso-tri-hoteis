import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notFound } from "next/navigation";
import { ehProprietario } from "@/lib/alcance-admin";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { BotaoCsv } from "@/components/admin/botao-csv";
import { SerieDeConclusoes } from "@/components/admin/serie-de-conclusoes";
import { levantarPainelGerencial, type LinhaDoGrupo } from "@/lib/relatorio-gerencial";

/**
 * O painel gerencial da rede.
 *
 * A tela responde três perguntas, nesta ordem, que é a ordem em que um diretor
 * as faz: **como estamos**, **onde está o problema** e **estamos melhorando**.
 *
 * Antes ela respondia só a terceira parte da segunda — média de conclusão por
 * curso e por departamento. Faltava o recorte por hotel, que numa rede de 25
 * casas é o recorte que tem dono, e faltava qualquer noção de tempo: "42
 * atrasados" vindo de 90 é uma equipe funcionando, vindo de 10 é um incêndio, e
 * a foto do instante mostra os dois iguais.
 */
export default async function RelatoriosPage() {
  const admin = await requireAdmin();

  /*
    Tela da conta proprietária. Relatórios e Atividades mostram a plataforma
    inteira — progresso e histórico de ação de todos os departamentos —, e
    Configurações decide a estrutura que governa o alcance de todo mundo.

    Devolve página inexistente em vez de uma tela de recusa: para quem não a
    alcança, a rota simplesmente não existe.
  */
  if (!(await ehProprietario(admin.id))) notFound();

  const now = new Date();

  // Os números de conformidade vêm de `levantarPainelGerencial`, que reusa a
  // mesma conta da tela de Conformidade. Uma segunda implementação aqui
  // acabaria discordando dela, que é o defeito que aquele módulo evita.
  const painel = await levantarPainelGerencial(now);

  /*
    Esta tela é uma consolidação: ela resume a plataforma inteira, então não há
    o que paginar. O que dava para corrigir era COMO os números são obtidos —
    antes, cada abertura trazia todas as matrículas e todos os registros de
    progresso para somar em memória. Agora a soma acontece no banco, e só duas
    listas pequenas vêm inteiras: os pares já concluídos e os com prazo
    vencido, necessários para cruzar as duas tabelas.
  */
  const [courses, matriculasPorCurso, progressoPorCurso, emAndamentoPorCurso, concluidos, comPrazoVencido] =
    await Promise.all([
      db.course.findMany({ orderBy: { title: "asc" } }),
      db.enrollment.groupBy({ by: ["courseId"], _count: { _all: true } }),
      db.courseProgress.groupBy({
        by: ["courseId"],
        _avg: { percent: true },
        _count: { _all: true },
      }),
      db.courseProgress.groupBy({
        by: ["courseId"],
        where: { percent: { gt: 0, lt: 100 } },
        _count: { _all: true },
      }),
      db.courseProgress.findMany({
        where: { percent: { gte: 100 } },
        select: { userId: true, courseId: true },
      }),
      db.enrollment.findMany({
        where: { dueDate: { lt: now } },
        select: { userId: true, courseId: true },
      }),
    ]);

  const chaveDe = (p: { userId: string; courseId: string }) => `${p.userId}:${p.courseId}`;
  const jaConcluiu = new Set(concluidos.map(chaveDe));

  const matriculas = new Map(matriculasPorCurso.map((m) => [m.courseId, m._count._all]));
  const progresso = new Map(progressoPorCurso.map((p) => [p.courseId, p]));
  const emAndamento = new Map(emAndamentoPorCurso.map((p) => [p.courseId, p._count._all]));

  const concluidosPorCurso = new Map<string, number>();
  for (const c of concluidos) {
    concluidosPorCurso.set(c.courseId, (concluidosPorCurso.get(c.courseId) ?? 0) + 1);
  }

  // Atrasado é prazo vencido sem conclusão — o cruzamento que o banco não faz.
  const atrasadosPorCurso = new Map<string, number>();
  for (const e of comPrazoVencido) {
    if (jaConcluiu.has(chaveDe(e))) continue;
    atrasadosPorCurso.set(e.courseId, (atrasadosPorCurso.get(e.courseId) ?? 0) + 1);
  }

  const courseReport = courses.map((course) => ({
    course,
    total: matriculas.get(course.id) ?? 0,
    completed: concluidosPorCurso.get(course.id) ?? 0,
    inProgress: emAndamento.get(course.id) ?? 0,
    overdue: atrasadosPorCurso.get(course.id) ?? 0,
    avgPercent: Math.round(progresso.get(course.id)?._avg.percent ?? 0),
  }));

  const cartoes = [
    {
      rotulo: "Conformidade da rede",
      valor: painel.taxa === null ? "—" : `${painel.taxa}%`,
      nota: `${painel.resumo.em_dia} de ${painel.resumo.total} obrigações`,
      cor: corDaTaxa(painel.taxa),
    },
    {
      /*
        Pessoas, não obrigações. "137 pendências" e "42 pessoas devendo" são
        números muito diferentes para quem vai cobrar, e é gente que se cobra.
      */
      rotulo: "Pessoas com pendência",
      valor: painel.pessoasComPendencia,
      nota: `de ${painel.funcionariosAtivos} funcionários ativos`,
      cor: painel.pessoasComPendencia > 0 ? "text-ink-900" : "text-success-600",
    },
    {
      rotulo: "Treinamentos atrasados",
      valor: painel.resumo.atrasado,
      nota: `${painel.resumo.vencendo} vencendo em 7 dias`,
      cor: painel.resumo.atrasado > 0 ? "text-danger-600" : "text-success-600",
    },
    {
      rotulo: "Aceites de documento em falta",
      valor: painel.documentos.aceitesEmFalta,
      nota: `${painel.documentos.publicados} documento(s) publicado(s)`,
      cor: painel.documentos.aceitesEmFalta > 0 ? "text-warning-600" : "text-success-600",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Painel gerencial</h1>
          <p className="text-sm text-ink-700/70">
            A rede inteira: onde está o atraso e como a coisa evoluiu.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <BotaoCsv fonte="conformidade" rotulo="Conformidade (CSV)" />
          <BotaoCsv fonte="usuarios" rotulo="Usuários (CSV)" />
          <BotaoCsv fonte="documentos" rotulo="Aceites (CSV)" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-ink-700/60">{c.rotulo}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.cor}`}>{c.valor}</p>
            <p className="mt-1 text-xs text-ink-700/50">{c.nota}</p>
          </div>
        ))}
      </div>

      <SerieDeConclusoes serie={painel.serie} />

      <TabelaDeGrupo
        titulo="Por hotel"
        descricao="Ordenado pelo pior: a casa com mais atraso primeiro."
        coluna="Hotel"
        linhas={painel.porHotel}
        vazio="Nenhum hotel cadastrado"
      />

      <TabelaDeGrupo
        titulo="Por departamento"
        descricao="O mesmo recorte, pela função em vez do lugar."
        coluna="Departamento"
        linhas={painel.porDepartamento}
        vazio="Nenhum departamento cadastrado"
      />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-ink-900">Por curso</h2>
          <p className="text-sm text-ink-700/70">
            Inclui os cursos opcionais — é engajamento, não conformidade.
          </p>
        </div>
        {courseReport.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum curso cadastrado" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Curso</th>
                    <th className="px-4 py-3 font-medium">Matrículas</th>
                    <th className="px-4 py-3 font-medium">Em andamento</th>
                    <th className="px-4 py-3 font-medium">Concluídos</th>
                    <th className="px-4 py-3 font-medium">Atrasados</th>
                    <th className="px-4 py-3 font-medium">Conclusão média</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {courseReport.map((r) => (
                    <tr key={r.course.id} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3 font-medium text-ink-900">{r.course.title}</td>
                      <td className="px-4 py-3 text-ink-700">{r.total}</td>
                      <td className="px-4 py-3 text-ink-700">{r.inProgress}</td>
                      <td className="px-4 py-3 text-ink-700">{r.completed}</td>
                      <td className="px-4 py-3">
                        {r.overdue > 0 ? <Badge tone="danger">{r.overdue}</Badge> : <span className="text-ink-700/50">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={r.avgPercent} size="sm" className="w-28" />
                          <span className="text-xs text-ink-700/60">{r.avgPercent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Verde só a partir de 90%: abaixo disso a rede ainda tem gente descoberta. */
function corDaTaxa(taxa: number | null): string {
  if (taxa === null) return "text-ink-700/50";
  if (taxa >= 90) return "text-success-600";
  if (taxa >= 70) return "text-warning-600";
  return "text-danger-600";
}

/**
 * A tabela de conformidade de um recorte — hotel ou departamento.
 *
 * As duas são a MESMA tabela com outro agrupamento, então são o mesmo
 * componente: escrever duas quase iguais garantiria que uma correção só
 * chegasse numa delas.
 */
function TabelaDeGrupo({
  titulo,
  descricao,
  coluna,
  linhas,
  vazio,
}: {
  titulo: string;
  descricao: string;
  coluna: string;
  linhas: LinhaDoGrupo[];
  vazio: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-ink-900">{titulo}</h2>
        <p className="text-sm text-ink-700/70">{descricao}</p>
      </div>

      {linhas.length === 0 ? (
        <EmptyState icon={BarChart3} title={vazio} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                <tr>
                  <th className="px-4 py-3 font-medium">{coluna}</th>
                  <th className="px-4 py-3 font-medium">Pessoas</th>
                  <th className="px-4 py-3 font-medium">Obrigações</th>
                  <th className="px-4 py-3 font-medium">Atrasados</th>
                  <th className="px-4 py-3 font-medium">Vencendo</th>
                  <th className="px-4 py-3 font-medium">Em dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => (
                  <tr key={l.grupoId ?? "sem-vinculo"} className="hover:bg-surface-muted/40">
                    <td className="px-4 py-3 font-medium text-ink-900">{l.nome}</td>
                    <td className="px-4 py-3 text-ink-700">{l.pessoas}</td>
                    <td className="px-4 py-3 text-ink-700">{l.obrigacoes}</td>
                    <td className="px-4 py-3">
                      {l.atrasado > 0 ? (
                        <Badge tone="danger">{l.atrasado}</Badge>
                      ) : (
                        <span className="text-ink-700/50">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {l.vencendo > 0 ? (
                        <Badge tone="warning">{l.vencendo}</Badge>
                      ) : (
                        <span className="text-ink-700/50">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/*
                        Sem obrigação atribuída não é 100%: é "sem medida". Uma
                        barra cheia ali diria que a casa está impecável quando
                        o que houve foi ninguém cadastrar nada.
                      */}
                      {l.taxa === null ? (
                        <span className="text-xs text-ink-700/50">sem obrigações</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={l.taxa} size="sm" className="w-24" />
                          <span className="text-xs tabular-nums text-ink-700/60">{l.taxa}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
