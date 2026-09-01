import { db } from "@/lib/db";

/**
 * Os números do painel administrativo.
 *
 * Três destes indicadores saíam de um `courseProgress.findMany()` sem filtro:
 * a tabela inteira vinha para a memória do servidor para virar duas contagens
 * e uma média. Pior, o cruzamento de atrasados fazia um `find()` nessa lista
 * DENTRO do laço das matrículas vencidas — custo do produto das duas, na
 * primeira tela que todo administrador abre.
 *
 * Agora cada número é uma agregação feita pelo banco, e o único cruzamento que
 * o SQL não resolve sozinho — prazo vencido de um lado, conclusão do outro, em
 * tabelas sem relação declarada entre si — carrega apenas os pares
 * (usuário, curso) de que precisa e encontra por conjunto.
 */
export async function getDashboardStats() {
  const now = new Date();

  const [
    totalEmployees,
    activeEmployees,
    publishedCourses,
    totalEnrollments,
    inProgress,
    completed,
    mediaGeral,
    recentActivity,
  ] = await Promise.all([
    db.user.count({ where: { role: "EMPLOYEE" } }),
    db.user.count({ where: { role: "EMPLOYEE", active: true } }),
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.enrollment.count(),
    db.courseProgress.count({ where: { percent: { gt: 0, lt: 100 } } }),
    db.courseProgress.count({ where: { percent: { gte: 100 } } }),
    db.courseProgress.aggregate({ _avg: { percent: true } }),
    db.adminActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { admin: true },
    }),
  ]);

  // Sem nenhum progresso registrado, `_avg` vem nulo — e a média de nada é 0.
  const avgCompletion = Math.round(mediaGeral._avg.percent ?? 0);

  /*
    Atrasado é prazo vencido SEM conclusão, e esse cruzamento o banco não faz:
    Enrollment e CourseProgress não têm relação declarada entre si. As duas
    listas vêm rasas — só os pares (usuário, curso) — e o encontro é por
    conjunto, não por varredura aninhada.

    O indicador conta PESSOAS, e não matrículas: quem está atrasado em três
    cursos é uma pessoa atrasada, que é como quem lê o painel entende o número.
  */
  const [vencidas, concluidos] = await Promise.all([
    db.enrollment.findMany({
      where: { dueDate: { lt: now } },
      select: { userId: true, courseId: true },
    }),
    db.courseProgress.findMany({
      where: { percent: { gte: 100 } },
      select: { userId: true, courseId: true },
    }),
  ]);

  const chave = (p: { userId: string; courseId: string }) => `${p.userId}:${p.courseId}`;
  const jaConcluiu = new Set(concluidos.map(chave));

  const overdueUserIds = new Set(
    vencidas.filter((e) => !jaConcluiu.has(chave(e))).map((e) => e.userId)
  );

  /*
    Os cinco cursos com mais matrículas. A ordenação e o corte acontecem no
    banco: antes vinham todos os cursos com ao menos uma matrícula, inteiros,
    para o JavaScript descartar tudo menos cinco.
  */
  const enrollmentsByCourse = await db.enrollment.groupBy({
    by: ["courseId"],
    _count: { courseId: true },
    orderBy: { _count: { courseId: "desc" } },
    take: 5,
  });

  const cursosDoTopo = await db.course.findMany({
    where: { id: { in: enrollmentsByCourse.map((e) => e.courseId) } },
    // A lista mostra posição, título e contagem. Mais que isso é peso à toa.
    select: { id: true, title: true },
  });
  const cursoPorId = new Map(cursosDoTopo.map((c) => [c.id, c]));

  const mostAccessed = enrollmentsByCourse.flatMap((e) => {
    const course = cursoPorId.get(e.courseId);
    return course ? [{ course, count: e._count.courseId }] : [];
  });

  const departmentCounts = await db.department.findMany({
    // Só funcionários: contar administradores faria o gráfico divergir do
    // indicador "Funcionários cadastrados", que já filtra por EMPLOYEE.
    include: { _count: { select: { users: { where: { role: "EMPLOYEE" } } } } },
  });

  const statusBreakdown = [
    { name: "Não iniciados", value: totalEnrollments - inProgress - completed, color: "#d6d3d1" },
    { name: "Em andamento", value: inProgress, color: "#ff6a00" },
    { name: "Concluídos", value: completed, color: "#15803d" },
  ];

  return {
    totalEmployees,
    activeEmployees,
    publishedCourses,
    totalEnrollments,
    inProgress,
    completed,
    overdueCount: overdueUserIds.size,
    avgCompletion,
    mostAccessed,
    recentActivity,
    // Setores vazios não dizem nada num gráfico de "funcionários por
    // departamento" e, depois da sincronização com a intranet, são muitos —
    // ficam de fora. Ordem decrescente para a leitura ser imediata.
    departmentCounts: departmentCounts
      .map((d) => ({ name: d.name, total: d._count.users }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total),
    statusBreakdown,
  };
}
