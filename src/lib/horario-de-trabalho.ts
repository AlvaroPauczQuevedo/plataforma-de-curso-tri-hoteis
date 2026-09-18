/**
 * Treinamento obrigatório feito fora do horário de trabalho.
 *
 * ---
 *
 * **O risco.**
 *
 * Treinamento obrigatório é tempo à disposição do empregador. A plataforma
 * registra com precisão de segundos quando cada pessoa estudou — e o
 * `videoWatchedSeconds` é deliberadamente à prova de adulteração, porque foi
 * feito para impedir que alguém fingisse ter assistido.
 *
 * O efeito colateral é que ela produz prova confiável de tempo trabalhado. Se
 * alguém fizer treinamento obrigatório às 22h de um domingo, o registro
 * documenta isso — e é o registro da própria empresa.
 *
 * A saída **não** é apagar: o histórico é a defesa da rede em qualquer
 * discussão sobre treinamento, e destruí-lo inverteria o ônus da prova. A saída
 * é **não gerar**: avisar quem está estudando fora de hora, e dar ao RH a lista
 * de quem estudou, para corrigir antes de virar passivo.
 *
 * ---
 *
 * **Por que isto é uma lista de CONFERÊNCIA, e não de violações.**
 *
 * Num hotel tem gente trabalhando às três da manhã, legitimamente. A recepção
 * da madrugada que faz o treinamento no horário dela está **dentro** do próprio
 * expediente — e a plataforma não sabe a escala de ninguém.
 *
 * Então a janela aqui é uma aproximação do horário comercial, e serve para
 * separar "provavelmente normal" de "vale olhar". Tratar o que cai fora como
 * irregularidade acusaria justamente quem trabalha à noite.
 */

import { db } from "@/lib/db";

/** Uma janela de expediente, em hora local de São Paulo. */
export type JanelaDeExpediente = {
  /** Hora de início, 0-23. */
  inicio: number;
  /** Hora de término, 0-23. Exclusiva: 22 significa "até 21h59". */
  fim: number;
  /** Dias da semana considerados úteis. 0 = domingo. */
  dias: readonly number[];
};

/**
 * A janela padrão: segunda a sábado, das 6h às 22h.
 *
 * Larga de propósito. Uma janela estreita encheria o relatório de turno da
 * tarde e de gente que começou às 6h30, e um relatório com ruído demais deixa
 * de ser lido — que é o mesmo que não existir.
 */
export const JANELA_PADRAO: JanelaDeExpediente = {
  inicio: 6,
  fim: 22,
  dias: [1, 2, 3, 4, 5, 6],
};

function numeroDoAmbiente(variavel: string, padrao: number, maximo: number): number {
  /*
    A variável AUSENTE ou VAZIA cai no padrão, e a conferência é do texto, não
    do número. `Number("")` é 0, e zero é hora válida — então, diferente do
    módulo de retenção, não dá para recusar pelo valor. Sem esta guarda,
    `EXPEDIENTE_INICIO=""` — que é como a variável aparece no `.env.example` —
    moveria o início do expediente para a meia-noite em silêncio.
  */
  const texto = process.env[variavel]?.trim();
  if (!texto) return padrao;

  const bruto = Number(texto);
  return Number.isInteger(bruto) && bruto >= 0 && bruto <= maximo ? bruto : padrao;
}

/** A janela configurada, ou a padrão. */
export function janelaConfigurada(): JanelaDeExpediente {
  const inicio = numeroDoAmbiente("EXPEDIENTE_INICIO", JANELA_PADRAO.inicio, 23);
  const fim = numeroDoAmbiente("EXPEDIENTE_FIM", JANELA_PADRAO.fim, 23);

  // Início depois do fim seria uma janela vazia, e tudo cairia no relatório.
  if (inicio >= fim) return JANELA_PADRAO;

  return { ...JANELA_PADRAO, inicio, fim };
}

/**
 * Hora e dia da semana de um instante, em São Paulo.
 *
 * A hospedagem roda em UTC. Sem converter, 21h de Brasília vira meia-noite, e
 * metade do turno da tarde apareceria como estudo de madrugada — o relatório
 * seria puro ruído.
 */
export function horaLocal(data: Date): { hora: number; diaDaSemana: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(data);

  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const sigla = partes.find((p) => p.type === "weekday")?.value ?? "Sun";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    // "24" aparece em algumas implementações para a meia-noite.
    hora: hora === 24 ? 0 : hora,
    diaDaSemana: Math.max(0, dias.indexOf(sigla)),
  };
}

/** O instante cai dentro da janela de expediente? */
export function dentroDoExpediente(data: Date, janela = janelaConfigurada()): boolean {
  const { hora, diaDaSemana } = horaLocal(data);
  if (!janela.dias.includes(diaDaSemana)) return false;
  return hora >= janela.inicio && hora < janela.fim;
}

/** O contrário, por legibilidade em quem chama. */
export function foraDoExpediente(data: Date, janela = janelaConfigurada()): boolean {
  return !dentroDoExpediente(data, janela);
}

/**
 * Como a janela é descrita na tela.
 *
 * Em texto, e não em números soltos: quem lê o aviso precisa saber qual é o
 * horário esperado, senão o aviso vira reclamação sem instrução.
 */
export function descreverJanela(janela = janelaConfigurada()): string {
  const fds = janela.dias.includes(0) && janela.dias.includes(6);
  const comSabado = janela.dias.includes(6);

  const dias = fds
    ? "todos os dias"
    : comSabado
      ? "de segunda a sábado"
      : "de segunda a sexta";

  return `${dias}, das ${janela.inicio}h às ${janela.fim}h`;
}

/* ------------------------------------------------- consolidação do relatório */

export type EstudoForaDeHora = {
  userId: string;
  quando: Date;
  curso: string;
};

export type LinhaForaDeHora = {
  userId: string;
  nome: string;
  ocorrencias: number;
  /** A mais recente, que é a que o RH vai perguntar sobre. */
  ultima: Date;
  cursos: string[];
};

/**
 * Agrupa por pessoa.
 *
 * Por pessoa e não por ocorrência porque a ação do RH é uma conversa, não uma
 * linha de planilha: doze registros da mesma pessoa são um assunto só.
 *
 * Ordena pelo maior número de ocorrências — quem estuda fora de hora com
 * frequência é um padrão, e padrão é o que custa caro; um registro isolado às
 * 22h05 provavelmente é alguém terminando a aula.
 */
export function agruparForaDeHora(
  registros: readonly EstudoForaDeHora[],
  nomePor: ReadonlyMap<string, string>
): LinhaForaDeHora[] {
  const porPessoa = new Map<string, LinhaForaDeHora>();

  for (const r of registros) {
    const atual = porPessoa.get(r.userId);

    if (!atual) {
      porPessoa.set(r.userId, {
        userId: r.userId,
        nome: nomePor.get(r.userId) ?? "—",
        ocorrencias: 1,
        ultima: r.quando,
        cursos: [r.curso],
      });
      continue;
    }

    atual.ocorrencias += 1;
    if (r.quando > atual.ultima) atual.ultima = r.quando;
    if (!atual.cursos.includes(r.curso)) atual.cursos.push(r.curso);
  }

  return [...porPessoa.values()].sort(
    (a, b) => b.ocorrencias - a.ocorrencias || b.ultima.getTime() - a.ultima.getTime()
  );
}

/* ------------------------------------------------------ o relatório, do banco */

/**
 * Quem fez treinamento OBRIGATÓRIO fora do expediente, nos últimos N dias.
 *
 * A evidência é `LessonProgress.updatedAt`: o instante em que a pessoa mexeu
 * numa aula. É o registro mais próximo de "estava estudando" que existe — o
 * login sozinho não prova estudo, e o progresso do curso é um agregado sem
 * hora útil.
 *
 * **Só matrícula obrigatória.** Curso opcional feito em casa, por vontade
 * própria, não é tempo à disposição do empregador — e incluí-lo encheria o
 * relatório de gente que estava estudando porque quis.
 */
export async function levantarEstudoForaDeHora(
  dias = 30,
  agora = new Date()
): Promise<{ linhas: LinhaForaDeHora[]; janela: string; desde: Date }> {
  const desde = new Date(agora.getTime() - dias * 864e5);
  const janela = janelaConfigurada();

  const progressos = await db.lessonProgress.findMany({
    where: { updatedAt: { gte: desde } },
    select: {
      userId: true,
      updatedAt: true,
      lesson: { select: { module: { select: { courseId: true, course: { select: { title: true } } } } } },
    },
  });

  // O filtro de horário acontece aqui: nenhum banco sabe o fuso de São Paulo.
  const foraDeHora = progressos.filter((p) => foraDoExpediente(p.updatedAt, janela));
  if (foraDeHora.length === 0) {
    return { linhas: [], janela: descreverJanela(janela), desde };
  }

  /*
    Só o que é OBRIGATÓRIO para aquela pessoa. A obrigatoriedade é por matrícula,
    não por curso: o mesmo curso pode ser obrigatório para um setor e opcional
    para outro.
  */
  const obrigatorias = await db.enrollment.findMany({
    where: {
      mandatory: true,
      userId: { in: [...new Set(foraDeHora.map((p) => p.userId))] },
      courseId: { in: [...new Set(foraDeHora.map((p) => p.lesson.module.courseId))] },
    },
    select: { userId: true, courseId: true },
  });
  const ehObrigatorio = new Set(obrigatorias.map((e) => `${e.userId}:${e.courseId}`));

  const registros: EstudoForaDeHora[] = foraDeHora
    .filter((p) => ehObrigatorio.has(`${p.userId}:${p.lesson.module.courseId}`))
    .map((p) => ({
      userId: p.userId,
      quando: p.updatedAt,
      curso: p.lesson.module.course.title,
    }));

  if (registros.length === 0) {
    return { linhas: [], janela: descreverJanela(janela), desde };
  }

  const pessoas = await db.user.findMany({
    where: { id: { in: [...new Set(registros.map((r) => r.userId))] } },
    select: { id: true, name: true },
  });

  return {
    linhas: agruparForaDeHora(registros, new Map(pessoas.map((p) => [p.id, p.name]))),
    janela: descreverJanela(janela),
    desde,
  };
}
