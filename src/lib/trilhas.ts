/**
 * Trilhas de aprendizagem: cursos em ORDEM.
 *
 * O que a plataforma não sabia expressar era a **dependência** entre cursos.
 * "Integração" antes de "Atendimento", "Boas práticas" antes de "Manipulação
 * de alimentos": a ordem existe no treinamento real de um hotel, e sem ela a
 * pessoa recebia cinco cursos no primeiro dia e começava pelo mais difícil —
 * que é como alguém desiste do segundo.
 *
 * Três decisões que definem o módulo:
 *
 * 1. **A trilha matricula em todos os cursos de uma vez.** Ver
 *    `matricula-automatica`. Matriculando etapa por etapa, a Conformidade
 *    mostraria uma pendência para quem deve cinco — o relatório ficaria
 *    correto e vazio ao mesmo tempo.
 * 2. **O bloqueio é de APRESENTAÇÃO, não de acesso.** O degrau trancado
 *    aparece cinza na tela. Ele não some, e a matrícula continua lá: a pessoa
 *    precisa ver o caminho inteiro para saber onde está.
 * 3. **Presencial destranca.** A conclusão vem de `conclusoes.ts`, a mesma
 *    fonte da Conformidade, da Reciclagem e do relatório de auditoria. Uma
 *    brigada feita em sala abre o degrau seguinte; qualquer outra fonte aqui
 *    seria a quinta resposta divergente para "quem concluiu".
 *
 * A primeira metade do arquivo é pura e não toca o banco — é o corte de
 * `conformidade.ts` e `liberacao-de-aulas.ts`, pelo mesmo motivo: regra sem
 * teste é regra que muda sozinha.
 */
import { db } from "@/lib/db";
import { chaveDeConclusao, conclusoesPorCurso } from "@/lib/conclusoes";

/* ------------------------------------------------------------ regras puras */

export type SituacaoDoDegrau = "concluido" | "liberado" | "trancado";

export type DegrauParaLiberacao = {
  courseId: string;
  ordem: number;
};

/**
 * A situação de cada degrau, numa passada.
 *
 * Gêmea de `mapaDeLiberacao`, que faz o mesmo para aulas dentro de um curso, e
 * escrita igual de propósito: quem entender uma entende a outra. A diferença é
 * que aqui **todo degrau tranca o seguinte** — não existe curso opcional dentro
 * de uma trilha. Uma trilha é uma sequência; um degrau que pode ser pulado não
 * é um degrau, é um curso avulso, e o lugar dele é fora dela.
 *
 * O primeiro degrau está sempre liberado: uma trilha que começa trancada não
 * tem como começar.
 */
export function mapaDeLiberacaoDaTrilha(
  /** Degraus já na ordem da trilha. */
  degrausEmOrdem: readonly DegrauParaLiberacao[],
  /** Ids dos cursos que a pessoa já concluiu, de qualquer origem. */
  concluidos: ReadonlySet<string>
): Map<string, SituacaoDoDegrau> {
  const situacoes = new Map<string, SituacaoDoDegrau>();
  let pendentesAntes = 0;

  for (const degrau of degrausEmOrdem) {
    if (concluidos.has(degrau.courseId)) {
      /*
        Concluído continua concluído mesmo com um buraco atrás.

        Acontece de verdade: a pessoa fez o curso avulso antes de a trilha
        existir, ou o RH lançou o presencial fora de ordem. Reapresentar como
        trancado o que ela já fez mandaria refazer treinamento — e ainda faria
        a Conformidade e a trilha discordarem sobre a mesma pessoa.
      */
      situacoes.set(degrau.courseId, "concluido");
      continue;
    }

    situacoes.set(degrau.courseId, pendentesAntes === 0 ? "liberado" : "trancado");
    pendentesAntes += 1;
  }

  return situacoes;
}

export type ProgressoDaTrilha = {
  total: number;
  concluidos: number;
  /** Inteiro de 0 a 100. Trilha vazia é 0, não 100. */
  percent: number;
  /** O curso em que a pessoa deve mexer agora; `null` se acabou ou está vazia. */
  proximoCursoId: string | null;
  completa: boolean;
};

/**
 * Quanto da trilha está feito.
 *
 * Conta DEGRAUS, e não percentual médio dos cursos. "Dois de cinco" é o que a
 * pessoa entende olhando a tela; uma média de percentuais diria 46% para quem
 * não terminou nada, porque meio curso feito não é meio treinamento cumprido.
 *
 * Trilha sem degrau devolve 0%, e não 100%. Uma trilha vazia não está
 * completa: está por montar, e mostrá-la verde esconderia justamente isso de
 * quem a criou.
 */
export function progressoDaTrilha(
  degrausEmOrdem: readonly DegrauParaLiberacao[],
  situacoes: ReadonlyMap<string, SituacaoDoDegrau>
): ProgressoDaTrilha {
  const total = degrausEmOrdem.length;
  let concluidos = 0;
  let proximoCursoId: string | null = null;

  for (const degrau of degrausEmOrdem) {
    const situacao = situacoes.get(degrau.courseId);
    if (situacao === "concluido") {
      concluidos += 1;
      continue;
    }
    // O primeiro não-concluído liberado é onde a pessoa deve mexer.
    if (proximoCursoId === null && situacao === "liberado") {
      proximoCursoId = degrau.courseId;
    }
  }

  return {
    total,
    concluidos,
    percent: total === 0 ? 0 : Math.round((concluidos / total) * 100),
    proximoCursoId,
    completa: total > 0 && concluidos === total,
  };
}

/**
 * Reordena os degraus a partir da lista de ids na ordem desejada.
 *
 * Devolve a lista completa e renumerada de 0 em diante, e não só o que mudou:
 * é o que impede buracos e empates na numeração depois de várias trocas. Ids
 * desconhecidos são ignorados, e os degraus não mencionados vão para o fim, na
 * ordem em que estavam — assim uma tela desatualizada não apaga um degrau que
 * outra pessoa acabou de acrescentar.
 */
export function renumerarDegraus(
  atuais: readonly { id: string; ordem: number }[],
  idsNaOrdemDesejada: readonly string[]
): { id: string; ordem: number }[] {
  const porId = new Map(atuais.map((d) => [d.id, d]));
  const saida: { id: string; ordem: number }[] = [];
  const usados = new Set<string>();

  for (const id of idsNaOrdemDesejada) {
    if (!porId.has(id) || usados.has(id)) continue;
    usados.add(id);
    saida.push({ id, ordem: saida.length });
  }

  for (const degrau of [...atuais].sort((a, b) => a.ordem - b.ordem)) {
    if (usados.has(degrau.id)) continue;
    saida.push({ id: degrau.id, ordem: saida.length });
  }

  return saida;
}

/* ---------------------------------------------------- as trilhas, do banco */

export type DegrauDaPessoa = {
  courseId: string;
  ordem: number;
  titulo: string;
  descricao: string;
  situacao: SituacaoDoDegrau;
  /** Percentual do curso em si, para a barra do degrau liberado. */
  percent: number;
  /** `true` quando a conclusão veio de treinamento presencial. */
  presencial: boolean;
  /** `false` quando a pessoa não tem matrícula — trilha publicada sem sincronizar. */
  matriculado: boolean;
};

export type TrilhaDaPessoa = {
  id: string;
  titulo: string;
  descricao: string | null;
  degraus: DegrauDaPessoa[];
  progresso: ProgressoDaTrilha;
};

/**
 * Os cursos que a pessoa concluiu, dentre os informados, de qualquer origem.
 *
 * Separada para poder ser reaproveitada pelas duas consultas abaixo sem
 * repetir a leitura das duas tabelas de conclusão.
 */
async function concluidosDentre(userId: string, courseIds: string[]): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set();

  const conclusoes = await conclusoesPorCurso(courseIds);
  const concluidos = new Set<string>();

  for (const courseId of courseIds) {
    if (conclusoes.has(chaveDeConclusao(userId, courseId))) concluidos.add(courseId);
  }
  return concluidos;
}

/**
 * As trilhas que alcançam esta pessoa, já com a situação de cada degrau.
 *
 * Alcança quem está num departamento a que a trilha foi atribuída — principal
 * ou adicional, como todo o resto do alcance nesta plataforma. Trilha não
 * publicada não aparece para ninguém.
 */
export async function trilhasDaPessoa(userId: string): Promise<TrilhaDaPessoa[]> {
  const pessoa = await db.user.findUnique({
    where: { id: userId },
    select: {
      departmentId: true,
      departamentosExtras: { select: { departmentId: true } },
    },
  });
  if (!pessoa) return [];

  const departamentos = [
    ...new Set([
      ...(pessoa.departmentId ? [pessoa.departmentId] : []),
      ...pessoa.departamentosExtras.map((d) => d.departmentId),
    ]),
  ];
  if (departamentos.length === 0) return [];

  const trilhas = await db.trilha.findMany({
    where: {
      publicada: true,
      departamentos: { some: { departmentId: { in: departamentos } } },
    },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      cursos: {
        orderBy: { ordem: "asc" },
        select: {
          ordem: true,
          courseId: true,
          course: { select: { title: true, description: true } },
        },
      },
    },
    orderBy: { titulo: "asc" },
  });
  if (trilhas.length === 0) return [];

  const todosOsCursos = [...new Set(trilhas.flatMap((t) => t.cursos.map((c) => c.courseId)))];

  const [concluidos, progressos, matriculas, conclusoes] = await Promise.all([
    concluidosDentre(userId, todosOsCursos),
    db.courseProgress.findMany({
      where: { userId, courseId: { in: todosOsCursos } },
      select: { courseId: true, percent: true },
    }),
    db.enrollment.findMany({
      where: { userId, courseId: { in: todosOsCursos } },
      select: { courseId: true },
    }),
    conclusoesPorCurso(todosOsCursos),
  ]);

  const percentPor = new Map(progressos.map((p) => [p.courseId, p.percent]));
  const matriculado = new Set(matriculas.map((m) => m.courseId));

  return trilhas.map((trilha) => {
    const emOrdem = trilha.cursos.map((c) => ({ courseId: c.courseId, ordem: c.ordem }));
    const situacoes = mapaDeLiberacaoDaTrilha(emOrdem, concluidos);

    return {
      id: trilha.id,
      titulo: trilha.titulo,
      descricao: trilha.descricao,
      progresso: progressoDaTrilha(emOrdem, situacoes),
      degraus: trilha.cursos.map((c) => ({
        courseId: c.courseId,
        ordem: c.ordem,
        titulo: c.course.title,
        descricao: c.course.description,
        situacao: situacoes.get(c.courseId) ?? "trancado",
        percent: percentPor.get(c.courseId) ?? 0,
        presencial:
          conclusoes.get(chaveDeConclusao(userId, c.courseId))?.origem === "externa",
        matriculado: matriculado.has(c.courseId),
      })),
    };
  });
}

export type LinhaDeAvancoNaTrilha = {
  userId: string;
  nome: string;
  concluidos: number;
  total: number;
  percent: number;
  /** O degrau em que a pessoa está parada; `null` se terminou. */
  paradoEm: string | null;
};

/**
 * Quem está em que degrau — a tela que o gestor abre.
 *
 * A pergunta útil não é "quantos por cento a equipe fez", é **onde a fila
 * empacou**: se doze pessoas estão paradas no mesmo degrau, o problema é
 * daquele curso, não das doze.
 */
export async function avancoNaTrilha(trilhaId: string): Promise<{
  linhas: LinhaDeAvancoNaTrilha[];
  gargalo: { titulo: string; parados: number } | null;
}> {
  const trilha = await db.trilha.findUnique({
    where: { id: trilhaId },
    select: {
      cursos: {
        orderBy: { ordem: "asc" },
        select: { ordem: true, courseId: true, course: { select: { title: true } } },
      },
      departamentos: { select: { departmentId: true } },
    },
  });
  if (!trilha) return { linhas: [], gargalo: null };

  const setores = trilha.departamentos.map((d) => d.departmentId);
  if (setores.length === 0 || trilha.cursos.length === 0) return { linhas: [], gargalo: null };

  /*
    Só funcionário ativo, e pelo mesmo motivo da tela de documentos: quem
    publica o treinamento não é cobrado por ele, e desligado não deve nada.
  */
  const pessoas = await db.user.findMany({
    where: {
      active: true,
      role: "EMPLOYEE",
      OR: [
        { departmentId: { in: setores } },
        { departamentosExtras: { some: { departmentId: { in: setores } } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (pessoas.length === 0) return { linhas: [], gargalo: null };

  const courseIds = trilha.cursos.map((c) => c.courseId);
  const conclusoes = await conclusoesPorCurso(courseIds);
  const tituloPor = new Map(trilha.cursos.map((c) => [c.courseId, c.course.title]));
  const emOrdem = trilha.cursos.map((c) => ({ courseId: c.courseId, ordem: c.ordem }));

  const paradosPorCurso = new Map<string, number>();

  const linhas = pessoas.map((pessoa) => {
    const concluidos = new Set(
      courseIds.filter((id) => conclusoes.has(chaveDeConclusao(pessoa.id, id)))
    );
    const situacoes = mapaDeLiberacaoDaTrilha(emOrdem, concluidos);
    const progresso = progressoDaTrilha(emOrdem, situacoes);

    if (progresso.proximoCursoId) {
      paradosPorCurso.set(
        progresso.proximoCursoId,
        (paradosPorCurso.get(progresso.proximoCursoId) ?? 0) + 1
      );
    }

    return {
      userId: pessoa.id,
      nome: pessoa.name,
      concluidos: progresso.concluidos,
      total: progresso.total,
      percent: progresso.percent,
      paradoEm: progresso.proximoCursoId ? tituloPor.get(progresso.proximoCursoId) ?? null : null,
    };
  });

  // O degrau que mais gente não passou. Empate fica com o mais cedo na ordem,
  // que é onde a fila realmente começa a travar.
  let gargalo: { titulo: string; parados: number } | null = null;
  for (const curso of trilha.cursos) {
    const parados = paradosPorCurso.get(curso.courseId) ?? 0;
    if (parados > (gargalo?.parados ?? 0)) {
      gargalo = { titulo: curso.course.title, parados };
    }
  }

  return { linhas, gargalo };
}
