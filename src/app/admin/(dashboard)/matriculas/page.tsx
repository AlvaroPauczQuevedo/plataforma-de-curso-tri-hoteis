import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { BulkEnrollForm } from "@/components/admin/bulk-enroll-form";
import { ActionButton } from "@/components/shared/action-button";
import { SelectFilter, Pagination } from "@/components/admin/table-filters";
import { buscarPessoasParaMatricula, removeEnrollment } from "@/lib/actions/enrollments";
import { formatPrazo } from "@/lib/utils";

const PAGE_SIZE = 25;

export default async function MatriculasPage(
  props: {
    searchParams: Promise<{ curso?: string; status?: string; hotel?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireAdmin();

  const page = Math.max(1, Number(searchParams.page ?? 1));

  /*
    A lista traz TODA conta ativa, administradores inclusive.

    Administrador também é aluno: precisa fazer o treinamento obrigatório do
    setor dele e, principalmente, o curso sobre a própria plataforma. Filtrar
    por perfil obrigaria a criar uma segunda conta para a mesma pessoa, com o
    histórico partido em duas e dois certificados em nomes diferentes.

    A matrícula automática por departamento continua alcançando apenas
    funcionários — mudá-la alteraria os números de conformidade, e essa é uma
    decisão separada desta.
  */
  /*
    A lista de pessoas NÃO vem inteira para cá.

    O `BulkEnrollForm` é componente de cliente: tudo que ele recebe é
    serializado dentro do HTML e viaja para o navegador. Antes esta consulta
    trazia toda conta ativa — 700 delas passavam de 400 KB por abertura de
    página, carregados no celular de quem só queria matricular três pessoas, e
    crescendo em linha reta com a rede.
    (Antes disso era pior: vinha `include`, e com ele o `passwordHash` de todo
    mundo. Ver o guarda contra isso em `scripts/fumaca.mjs`.)

    Agora só a PRIMEIRA página vem daqui, para a lista não abrir vazia; a
    busca seguinte acontece no servidor, por `buscarPessoasParaMatricula`.
  */
  const [pessoasIniciais, courses, departamentos, unidades] = await Promise.all([
    buscarPessoasParaMatricula(""),
    db.course.findMany({ where: { status: "PUBLISHED" }, orderBy: { title: "asc" } }),
    // Só id e nome: a lista vai para o formulário, que é de cliente.
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.unidade.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  /*
    O hotel filtra pela PESSOA matriculada, não pela matrícula: quem tem
    unidade é o funcionário, e a matrícula só o liga a um curso. Sem passar
    pela relação, o filtro não teria em que coluna se apoiar.
  */
  const onde = {
    ...(searchParams.curso ? { courseId: searchParams.curso } : {}),
    ...(searchParams.hotel ? { user: { unidadeId: searchParams.hotel } } : {}),
  };

  // Só os campos que a tabela mostra. Estes ficam no servidor, mas trazer o
  // registro inteiro custa memória à toa — e o dia em que alguém passar isto a
  // um componente de cliente, o vazamento volta pela porta dos fundos.
  const CAMPOS = {
    id: true,
    userId: true,
    courseId: true,
    mandatory: true,
    dueDate: true,
    assignedAt: true,
    user: { select: { id: true, name: true, username: true } },
    course: { select: { id: true, title: true } },
  } as const;

  // O tipo sai do próprio `select`: acrescentar um campo lá o traz para cá
  // sozinho, em vez de deixar as duas listas divergirem em silêncio.
  type Matricula = Prisma.EnrollmentGetPayload<{ select: typeof CAMPOS }>;

  const now = new Date();

  /**
   * O status nasce do cruzamento entre progresso e prazo, e não existe como
   * coluna. É o que decide por onde a paginação pode passar.
   */
  const comStatus = (
    linhas: Matricula[],
    progressos: Map<string, { percent: number }>
  ) =>
    linhas.map((e) => {
      const percent = progressos.get(`${e.userId}:${e.courseId}`)?.percent ?? 0;
      const completed = percent >= 100;
      const overdue = Boolean(e.dueDate && !completed && new Date(e.dueDate) < now);
      return {
        ...e,
        percent,
        completed,
        overdue,
        status: completed
          ? "completed"
          : overdue
            ? "overdue"
            : percent > 0
              ? "in_progress"
              : "not_started",
      };
    });

  const progressoDe = async (linhas: { userId: string; courseId: string }[]) => {
    if (linhas.length === 0) return new Map<string, { percent: number }>();
    const progressos = await db.courseProgress.findMany({
      where: {
        userId: { in: [...new Set(linhas.map((e) => e.userId))] },
        courseId: { in: [...new Set(linhas.map((e) => e.courseId))] },
      },
      select: { userId: true, courseId: true, percent: true },
    });
    return new Map(progressos.map((p) => [`${p.userId}:${p.courseId}`, p]));
  };

  let pagina: ReturnType<typeof comStatus>;
  let total: number;

  if (searchParams.status) {
    /*
      COM filtro de status, não há como paginar no banco: o status não é
      coluna, então o banco não sabe quantas linhas o filtro deixa passar.
      Paginar antes faria o filtro valer só dentro da página, e a contagem do
      topo mentiria — que é pior do que a varredura.
    */
    const todas = await db.enrollment.findMany({
      where: onde,
      select: CAMPOS,
      orderBy: { assignedAt: "desc" },
    });
    const filtradas = comStatus(todas, await progressoDe(todas)).filter(
      (e) => e.status === searchParams.status
    );

    total = filtradas.length;
    pagina = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    /*
      SEM filtro de status — o caso comum, e o padrão da tela — a página sai do
      banco. Antes, abrir esta tela carregava TODA matrícula da plataforma e o
      progresso de todas elas, para desenhar 25 linhas; agora são 25 linhas e o
      progresso de 25. O status continua sendo calculado, mas só para o que
      aparece.
    */
    const [linhas, contagem] = await Promise.all([
      db.enrollment.findMany({
        where: onde,
        select: CAMPOS,
        orderBy: { assignedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.enrollment.count({ where: onde }),
    ]);

    total = contagem;
    pagina = comStatus(linhas, await progressoDe(linhas));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusBadge = {
    not_started: <Badge tone="neutral">Não iniciado</Badge>,
    in_progress: <Badge tone="accent">Em andamento</Badge>,
    overdue: <Badge tone="danger">Atrasado</Badge>,
    completed: <Badge tone="success">Concluído</Badge>,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Matrículas</h1>
        <p className="text-sm text-ink-700/70">Libere cursos para um ou vários funcionários de uma vez.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold text-ink-900">Nova matrícula em massa</h2>
        <BulkEnrollForm
          iniciais={pessoasIniciais}
          courses={courses}
          departamentos={departamentos}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink-900">Matrículas existentes ({total})</h2>
          <Suspense>
            <div className="flex gap-3">
              <SelectFilter
                paramKey="curso"
                placeholder="Todos os cursos"
                options={courses.map((c) => ({ value: c.id, label: c.title }))}
              />
              <SelectFilter
                paramKey="hotel"
                placeholder="Todos os hotéis"
                options={unidades.map((u) => ({ value: u.id, label: u.name }))}
              />
              <SelectFilter
                paramKey="status"
                placeholder="Todos os status"
                options={[
                  { value: "not_started", label: "Não iniciado" },
                  { value: "in_progress", label: "Em andamento" },
                  { value: "overdue", label: "Atrasado" },
                  { value: "completed", label: "Concluído" },
                ]}
              />
            </div>
          </Suspense>
        </div>

        {total === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma matrícula encontrada" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Funcionário</th>
                    <th className="px-4 py-3 font-medium">Curso</th>
                    <th className="px-4 py-3 font-medium">Progresso</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Prazo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagina.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-muted/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900">{e.user.name}</p>
                        <p className="text-xs text-ink-700/50">{e.user.username}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-700">
                        {e.course.title}
                        {e.mandatory && <Badge tone="navy" className="ml-2">Obrigatório</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={e.percent} size="sm" className="w-24" />
                          <span className="text-xs text-ink-700/60">{e.percent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge[e.status as keyof typeof statusBadge]}</td>
                      <td className="px-4 py-3 text-xs text-ink-700/60">{formatPrazo(e.dueDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <ActionButton
                          action={removeEnrollment.bind(null, e.userId, e.courseId)}
                          variant="ghost"
                          size="sm"
                          confirmMessage="Remover esta matrícula?"
                        >
                          Remover
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} />
          </div>
        )}
      </section>
    </div>
  );
}
