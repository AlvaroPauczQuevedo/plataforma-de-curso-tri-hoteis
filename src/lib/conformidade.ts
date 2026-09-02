/**
 * Quem está em dia com o treinamento obrigatório, e quem não está.
 *
 * A regra vivia inteira dentro da tela `/admin/conformidade`. Passou para cá
 * quando um segundo lugar precisou dela — o resumo semanal por e-mail. Duas
 * cópias da mesma conta acabariam discordando, e o jeito que isso apareceria é
 * o pior possível numa auditoria: a tela dizendo doze atrasados e o e-mail
 * dizendo nove, sem ninguém saber qual está certo.
 *
 * Só matrícula OBRIGATÓRIA entra. Curso opcional não é dívida de ninguém, e
 * misturá-lo inflaria o número de pendências até o relatório virar ruído.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * "Vence em breve" é uma semana.
 *
 * Tempo suficiente para alguém agir, curto o bastante para o aviso não virar
 * ruído permanente que se aprende a ignorar.
 */
export const DIAS_DE_ALERTA = 7;

export type Situacao = "em_dia" | "vencendo" | "atrasado" | "pendente";

export type Obrigacao = {
  id: string;
  userId: string;
  courseId: string;
  dueDate: Date | null;
  percent: number;
  concluido: boolean;
  /** Negativo quando o prazo já passou. Nulo quando não há prazo. */
  diasRestantes: number | null;
  situacao: Situacao;
};

export type Resumo = {
  total: number;
  em_dia: number;
  vencendo: number;
  atrasado: number;
  pendente: number;
};

/**
 * A situação de uma obrigação, como função pura.
 *
 * Recebe o "agora" por parâmetro pelo mesmo motivo da regra de crédito de
 * vídeo: é a única parte cujo resultado depende do relógio, e assim dá para
 * exercitar a virada de um prazo em teste sem esperar um dia.
 *
 * Concluído vence qualquer prazo: quem terminou está em dia, ainda que tenha
 * terminado atrasado. O relatório responde "o que falta fazer", não "quem
 * cumpriu o cronograma" — são perguntas diferentes, e misturá-las deixaria
 * gente concluída aparecendo na lista de cobrança.
 */
export function situacaoDaObrigacao(entrada: {
  percent: number;
  dueDate: Date | null;
  agora: Date;
}): { situacao: Situacao; concluido: boolean; diasRestantes: number | null } {
  const concluido = entrada.percent >= 100;

  const diasRestantes = entrada.dueDate
    ? Math.ceil((entrada.dueDate.getTime() - entrada.agora.getTime()) / DIA_EM_MS)
    : null;

  if (concluido) return { situacao: "em_dia", concluido, diasRestantes };
  if (diasRestantes === null) return { situacao: "pendente", concluido, diasRestantes };
  if (diasRestantes < 0) return { situacao: "atrasado", concluido, diasRestantes };
  if (diasRestantes <= DIAS_DE_ALERTA) return { situacao: "vencendo", concluido, diasRestantes };

  return { situacao: "pendente", concluido, diasRestantes };
}

/** Conta quantas obrigações há em cada situação. */
export function resumirObrigacoes(linhas: Obrigacao[]): Resumo {
  const resumo: Resumo = { total: linhas.length, em_dia: 0, vencendo: 0, atrasado: 0, pendente: 0 };
  for (const linha of linhas) resumo[linha.situacao] += 1;
  return resumo;
}

export type FiltroDeConformidade = {
  /** Busca por nome ou e-mail do funcionário. */
  q?: string;
  departamentoId?: string;
};

/**
 * Levanta todas as obrigações que atendem ao filtro, já com a situação.
 *
 * Traz a lista RASA de propósito. Os totais obrigam a percorrer todas as
 * obrigações — a situação de cada uma depende do progresso, que mora em outra
 * tabela, e nenhum SQL daqui resolve o cruzamento sozinho. Mas nome, e-mail,
 * departamento e título do curso só aparecem nas poucas linhas que alguém vai
 * de fato ler; quem precisa deles busca depois, só para essas.
 */
export async function levantarObrigacoes(
  filtro: FiltroDeConformidade = {},
  agora = new Date()
): Promise<{ linhas: Obrigacao[]; resumo: Resumo }> {
  const doUsuario: Prisma.UserWhereInput = {
    active: true,
    role: "EMPLOYEE",
    ...(filtro.departamentoId ? { departmentId: filtro.departamentoId } : {}),
    ...(filtro.q
      ? { OR: [{ name: { contains: filtro.q } }, { email: { contains: filtro.q } }] }
      : {}),
  };

  const obrigatorias = await db.enrollment.findMany({
    where: { mandatory: true, user: doUsuario },
    select: { id: true, userId: true, courseId: true, dueDate: true },
    orderBy: [{ dueDate: "asc" }, { assignedAt: "asc" }],
  });

  /*
    O percentual mora em CourseProgress, tabela separada de Enrollment e sem
    relação declarada entre as duas. Buscamos só os pares que interessam.
  */
  const progressos = await db.courseProgress.findMany({
    where: {
      userId: { in: [...new Set(obrigatorias.map((m) => m.userId))] },
      courseId: { in: [...new Set(obrigatorias.map((m) => m.courseId))] },
    },
    select: { userId: true, courseId: true, percent: true },
  });

  const percentPor = new Map(progressos.map((p) => [`${p.userId}:${p.courseId}`, p.percent]));

  const linhas: Obrigacao[] = obrigatorias.map((m) => {
    const percent = percentPor.get(`${m.userId}:${m.courseId}`) ?? 0;
    const { situacao, concluido, diasRestantes } = situacaoDaObrigacao({
      percent,
      dueDate: m.dueDate,
      agora,
    });
    return { ...m, percent, concluido, diasRestantes, situacao };
  });

  return { linhas, resumo: resumirObrigacoes(linhas) };
}

/* --------------------------------------------------------- resumo por setor */

export type LinhaDeSetor = {
  departamento: string;
  atrasado: number;
  vencendo: number;
};

/**
 * O que está pendente, agrupado por departamento.
 *
 * É o recorte que o e-mail semanal usa: quem lê é o RH, e a primeira pergunta
 * de quem cobra é "onde", não "quem". A lista nominal continua na tela.
 *
 * Agrupa pelo departamento PRINCIPAL, como o resto dos relatórios. Se uma
 * pessoa contasse em dois setores, a soma passaria a ser maior que o total de
 * pendências — número que ninguém consegue defender numa auditoria.
 */
export async function pendenciasPorSetor(linhas: Obrigacao[]): Promise<LinhaDeSetor[]> {
  const emAberto = linhas.filter(
    (l) => l.situacao === "atrasado" || l.situacao === "vencendo"
  );
  if (emAberto.length === 0) return [];

  const pessoas = await db.user.findMany({
    where: { id: { in: [...new Set(emAberto.map((l) => l.userId))] } },
    select: { id: true, department: { select: { name: true } } },
  });

  const setorDe = new Map(pessoas.map((p) => [p.id, p.department?.name ?? "Sem departamento"]));
  const porSetor = new Map<string, LinhaDeSetor>();

  for (const linha of emAberto) {
    const nome = setorDe.get(linha.userId) ?? "Sem departamento";
    const atual = porSetor.get(nome) ?? { departamento: nome, atrasado: 0, vencendo: 0 };

    if (linha.situacao === "atrasado") atual.atrasado += 1;
    else atual.vencendo += 1;

    porSetor.set(nome, atual);
  }

  // O setor com mais atraso primeiro: é por ele que a cobrança começa.
  return [...porSetor.values()].sort(
    (a, b) => b.atrasado - a.atrasado || b.vencendo - a.vencendo
  );
}
