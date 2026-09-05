/**
 * Quem recebeu acesso e ainda não começou.
 *
 * Existe por uma limitação concreta desta rede: **ninguém tem e-mail**. Não há
 * como disparar lembrete para o funcionário — nem de senha, nem de treinamento
 * vencendo. O único caminho de cobrança é alguém saber a quem cobrar e falar
 * com a pessoa ou com o gestor dela.
 *
 * A senha provisória é entregue em papel, uma vez. A partir daí ninguém sabe
 * se ela foi usada, se o papel se perdeu, ou se a pessoa entrou e parou na
 * primeira tela. `lastLoginAt` já era gravado a cada login, mas só aparecia na
 * ficha individual — descobrir quem faltava exigia abrir uma conta por vez.
 *
 * É uma pergunta diferente da de `lib/conformidade`, e por isso mora separado:
 * lá é "quem está atrasado no que devia"; aqui é "a credencial que eu entreguei
 * chegou a virar acesso". Alguém sem curso obrigatório não aparece na
 * conformidade nunca, e ainda assim pode ter recebido uma senha que nunca usou.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export type SituacaoDeAcesso =
  /** Não tem curso nenhum atribuído: não há o que começar. */
  | "sem_curso"
  /** Tem curso, mas nunca usou a senha. */
  | "nunca_entrou"
  /** Entrou e não concluiu nenhuma aula. */
  | "entrou_sem_comecar"
  /** Já concluiu ao menos uma aula. */
  | "ativo";

export type LinhaDeAcesso = {
  userId: string;
  situacao: SituacaoDeAcesso;
  /** Há quantos dias a credencial foi entregue. É a medida da urgência. */
  diasDesdeCadastro: number;
  /** Nulo para quem nunca entrou. */
  diasDesdeUltimoAcesso: number | null;
  matriculas: number;
  aulasConcluidas: number;
};

export type ResumoDeAcesso = {
  total: number;
  sem_curso: number;
  nunca_entrou: number;
  entrou_sem_comecar: number;
  ativo: number;
};

/**
 * A situação de uma pessoa, como função pura.
 *
 * `sem_curso` vem ANTES de `nunca_entrou` de propósito. As duas pedem ações de
 * donos diferentes: sem curso, quem precisa agir é o administrador, que
 * esqueceu de matricular; sem login, quem precisa agir é o gestor, que vai
 * atrás da pessoa. Cobrar alguém por não ter começado um treinamento que
 * ninguém atribuiu a ela é o tipo de erro que desmoraliza a cobrança inteira.
 */
export function situacaoDeAcesso(entrada: {
  matriculas: number;
  lastLoginAt: Date | null;
  aulasConcluidas: number;
}): SituacaoDeAcesso {
  if (entrada.matriculas === 0) return "sem_curso";
  if (!entrada.lastLoginAt) return "nunca_entrou";
  if (entrada.aulasConcluidas === 0) return "entrou_sem_comecar";
  return "ativo";
}

/** Dias inteiros entre duas datas, nunca negativo. */
export function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / DIA_EM_MS));
}

export function resumirAcessos(linhas: LinhaDeAcesso[]): ResumoDeAcesso {
  const resumo: ResumoDeAcesso = {
    total: linhas.length,
    sem_curso: 0,
    nunca_entrou: 0,
    entrou_sem_comecar: 0,
    ativo: 0,
  };
  for (const linha of linhas) resumo[linha.situacao] += 1;
  return resumo;
}

export type FiltroDeAcesso = { q?: string; departamentoId?: string };

/**
 * Levanta a situação de acesso de todo funcionário ativo.
 *
 * Administrador fica de fora: ele não é público de treinamento, e a conta dele
 * entrando na lista de cobrança só geraria ruído. Inativo também sai — quem
 * foi desligado não deve nada, e o histórico dele continua preservado.
 *
 * Três consultas de tamanho fixo, e não uma por pessoa: os contadores vêm
 * agregados pelo banco. Com a rede inteira na tela, um `include` por linha
 * multiplicaria a consulta pelo número de funcionários.
 */
export async function levantarPrimeiroAcesso(
  filtro: FiltroDeAcesso = {},
  agora = new Date()
): Promise<{ linhas: LinhaDeAcesso[]; resumo: ResumoDeAcesso }> {
  const onde: Prisma.UserWhereInput = {
    active: true,
    role: "EMPLOYEE",
    ...(filtro.departamentoId ? { departmentId: filtro.departamentoId } : {}),
    ...(filtro.q
      ? { OR: [{ name: { contains: filtro.q } }, { username: { contains: filtro.q } }] }
      : {}),
  };

  const pessoas = await db.user.findMany({
    where: onde,
    select: { id: true, lastLoginAt: true, createdAt: true },
  });

  if (pessoas.length === 0) {
    return { linhas: [], resumo: resumirAcessos([]) };
  }

  const ids = pessoas.map((p) => p.id);

  const [matriculas, concluidas] = await Promise.all([
    db.enrollment.groupBy({
      by: ["userId"],
      where: { userId: { in: ids } },
      _count: { _all: true },
    }),
    db.lessonProgress.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, completed: true },
      _count: { _all: true },
    }),
  ]);

  const porMatricula = new Map(matriculas.map((m) => [m.userId, m._count._all]));
  const porAula = new Map(concluidas.map((c) => [c.userId, c._count._all]));

  const linhas: LinhaDeAcesso[] = pessoas.map((pessoa) => {
    const dados = {
      matriculas: porMatricula.get(pessoa.id) ?? 0,
      lastLoginAt: pessoa.lastLoginAt,
      aulasConcluidas: porAula.get(pessoa.id) ?? 0,
    };
    return {
      userId: pessoa.id,
      situacao: situacaoDeAcesso(dados),
      diasDesdeCadastro: diasEntre(pessoa.createdAt, agora),
      diasDesdeUltimoAcesso: pessoa.lastLoginAt ? diasEntre(pessoa.lastLoginAt, agora) : null,
      matriculas: dados.matriculas,
      aulasConcluidas: dados.aulasConcluidas,
    };
  });

  /*
    Ordem de cobrança, não alfabética: primeiro quem está parado há mais tempo.
    Uma credencial entregue há sessenta dias e nunca usada é um problema
    diferente de uma entregue ontem, e a lista tem que dizer isso sem que
    ninguém precise reordenar coluna nenhuma.
  */
  const PESO: Record<SituacaoDeAcesso, number> = {
    nunca_entrou: 0,
    sem_curso: 1,
    entrou_sem_comecar: 2,
    ativo: 3,
  };

  linhas.sort(
    (a, b) =>
      PESO[a.situacao] - PESO[b.situacao] || b.diasDesdeCadastro - a.diasDesdeCadastro
  );

  return { linhas, resumo: resumirAcessos(linhas) };
}
