import { Route, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { carregarAtorOuFalhar } from "@/lib/alcance-admin";
import { avancoNaTrilha } from "@/lib/trilhas";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TrilhaForm } from "@/components/admin/trilha-form";
import { TrilhaEditor } from "@/components/admin/trilha-editor";

/**
 * Trilhas: montar a ordem, atribuir aos setores e ver onde a fila empacou.
 *
 * A pergunta que esta tela responde e que nenhuma outra respondia é **em que
 * degrau a equipe parou**. Doze pessoas paradas no mesmo curso não são doze
 * problemas de disciplina: são um problema daquele curso.
 */
export const dynamic = "force-dynamic";

export default async function TrilhasAdminPage() {
  const admin = await requireAdmin();
  const ator = await carregarAtorOuFalhar(admin.id);

  const [trilhas, departamentos, cursos] = await Promise.all([
    db.trilha.findMany({
      orderBy: [{ publicada: "desc" }, { titulo: "asc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        publicada: true,
        departmentId: true,
        department: { select: { name: true } },
        cursos: {
          orderBy: { ordem: "asc" },
          select: { id: true, courseId: true, course: { select: { title: true } } },
        },
        departamentos: {
          select: { departmentId: true, prazoDias: true, department: { select: { name: true } } },
        },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    /*
      Só curso publicado entra numa trilha: um degrau em rascunho trava todo
      mundo atrás dele. A action recusa também — aqui é só não oferecer.
    */
    db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, departmentId: true },
    }),
  ]);

  // O avanço só é levantado para trilha publicada: em rascunho não há
  // ninguém matriculado, e a consulta seria um percurso caro devolvendo zero.
  const avancos = new Map(
    await Promise.all(
      trilhas
        .filter((t) => t.publicada)
        .map(async (t) => [t.id, await avancoNaTrilha(t.id)] as const)
    )
  );

  /*
    O que este administrador alcança. O proprietário vê tudo; os demais, o dos
    seus setores. A trava de verdade está nas actions — isto aqui é a tela não
    oferecer o que seria recusado.
  */
  const alcanca = (departmentId: string | null) =>
    ator.protegido || (departmentId !== null && ator.departamentos.includes(departmentId));

  const meusDepartamentos = ator.protegido
    ? departamentos
    : departamentos.filter((d) => ator.departamentos.includes(d.id));

  const meusCursos = cursos.filter((c) => alcanca(c.departmentId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Trilhas</h1>
          <p className="mt-1 text-sm text-ink-700/70">
            Cursos em ordem: cada degrau abre o próximo. O curso avulso ensina uma coisa; a
            trilha ensina um caminho.
          </p>
        </div>

        <TrilhaForm departamentos={meusDepartamentos} proprietario={ator.protegido} />
      </div>

      {trilhas.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Nenhuma trilha criada"
          description="Monte uma sequência de cursos — integração, depois atendimento, depois a norma do setor — e atribua ao time."
        />
      ) : (
        <div className="space-y-4">
          {trilhas.map((trilha) => {
            const avanco = avancos.get(trilha.id);
            const editavel = alcanca(trilha.departmentId);

            return (
              <section
                key={trilha.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-ink-900">{trilha.titulo}</h2>
                      {trilha.publicada ? (
                        <Badge tone="success">Publicada</Badge>
                      ) : (
                        <Badge tone="neutral">Rascunho</Badge>
                      )}
                      <Badge tone="neutral">
                        {trilha.department?.name ?? "Da rede"}
                      </Badge>
                    </div>
                    {trilha.descricao && (
                      <p className="mt-1 text-sm text-ink-700/70">{trilha.descricao}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-700/50">
                      {trilha.cursos.length} degrau(s)
                    </p>
                  </div>

                  {avanco && avanco.linhas.length > 0 && (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-ink-700/60">Equipe</p>
                      <p className="text-sm text-ink-900">
                        {avanco.linhas.filter((l) => l.percent === 100).length} de{" "}
                        {avanco.linhas.length} concluíram
                      </p>
                    </div>
                  )}
                </div>

                {/*
                  O gargalo em destaque. É a informação que muda uma decisão:
                  se metade da equipe parou no mesmo degrau, o problema é do
                  curso — longo demais, confuso, ou com prova impossível.
                */}
                {avanco?.gargalo && avanco.gargalo.parados > 1 && (
                  <div className="flex items-start gap-2 border-b border-border bg-warning-100/40 px-5 py-3">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
                    <p className="text-sm text-ink-800">
                      <strong className="font-medium">{avanco.gargalo.parados} pessoas</strong>{" "}
                      estão paradas em <strong className="font-medium">{avanco.gargalo.titulo}</strong>.
                      Quando a fila trava no mesmo degrau, costuma ser o curso, não a equipe.
                    </p>
                  </div>
                )}

                <div className="p-5">
                  {editavel ? (
                    <TrilhaEditor
                      trilhaId={trilha.id}
                      publicada={trilha.publicada}
                      degraus={trilha.cursos.map((c) => ({
                        id: c.id,
                        courseId: c.courseId,
                        titulo: c.course.title,
                      }))}
                      atribuicoes={trilha.departamentos.map((d) => ({
                        departmentId: d.departmentId,
                        nome: d.department.name,
                        prazoDias: d.prazoDias,
                      }))}
                      cursosDisponiveis={meusCursos}
                      departamentosDisponiveis={meusDepartamentos}
                    />
                  ) : (
                    <p className="text-sm text-ink-700/60">
                      Esta trilha pertence a outro departamento. Você pode acompanhar, mas não
                      alterar.
                    </p>
                  )}

                  {avanco && avanco.linhas.length > 0 && (
                    <details className="mt-4 border-t border-border pt-4">
                      <summary className="cursor-pointer text-sm font-medium text-brand-texto">
                        Ver quem está em qual degrau
                      </summary>

                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-xs uppercase tracking-wide text-ink-700/60">
                            <tr>
                              <th className="py-2 font-medium">Funcionário</th>
                              <th className="py-2 font-medium">Avanço</th>
                              <th className="py-2 font-medium">Parado em</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {avanco.linhas.map((linha) => (
                              <tr key={linha.userId}>
                                <td className="py-2 text-ink-900">{linha.nome}</td>
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <ProgressBar percent={linha.percent} size="sm" className="w-20" />
                                    <span className="text-xs tabular-nums text-ink-700/60">
                                      {linha.concluidos}/{linha.total}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 text-xs text-ink-700/70">
                                  {linha.paradoEm ?? (
                                    <span className="text-success-600">concluiu tudo</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
