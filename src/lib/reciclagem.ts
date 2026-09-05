/**
 * Reciclagem: o certificado ainda vale?
 *
 * Os treinamentos que mais importam num hotel VENCEM — manipulação de
 * alimentos, brigada de incêndio, as NRs. Um certificado de 2024 não prova
 * nada em 2026, e é exatamente isso que um auditor pergunta.
 *
 * Até aqui a plataforma não tinha noção de validade: `Certificate` só guarda
 * `issuedAt`, e concluído era concluído para sempre. Ela era um registro do
 * que foi feito. Com `CursoObrigatorio.validadeMeses`, passa a apontar o que
 * está prestes a deixar de valer.
 *
 * ---
 *
 * **Por que isto detecta e não rematricula sozinho.**
 *
 * A tentação era resetar o progresso de quem venceu, para a pessoa reaparecer
 * como pendente. Só que `recalculateCourseProgress` APAGA o certificado quando
 * o curso deixa de estar completo (ver `lib/progress`) — então uma reciclagem
 * automática destruiria, sozinha e em silêncio, o comprovante de que o
 * treinamento foi feito no ano passado.
 *
 * É o oposto do que este módulo existe para servir. Numa auditoria, "ela fez em
 * 2025 e está vencendo" é uma resposta; "não há registro" não é. O princípio
 * que o resto do sistema já segue — histórico e certificado sobrevivem a tudo —
 * vale mais aqui do que a comodidade de não clicar.
 *
 * Então este módulo responde QUEM precisa refazer, e a rematrícula continua
 * sendo um ato de quem administra, pela tela de Matrículas, com o registro
 * antigo intacto.
 */
import { db } from "@/lib/db";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Um mês de antecedência, e não uma semana como na Conformidade.
 *
 * Reciclagem não se resolve numa tarde: costuma exigir turma, instrutor e
 * escala coberta. Avisar com sete dias seria avisar tarde demais para servir.
 */
export const DIAS_DE_ALERTA_RECICLAGEM = 30;

export type SituacaoDeReciclagem = "vigente" | "vencendo" | "vencido";

export type LinhaDeReciclagem = {
  userId: string;
  courseId: string;
  emitidoEm: Date;
  venceEm: Date;
  diasRestantes: number;
  situacao: SituacaoDeReciclagem;
  validadeMeses: number;
};

export type ResumoDeReciclagem = {
  total: number;
  vigente: number;
  vencendo: number;
  vencido: number;
};

/**
 * Quando um certificado deixa de valer.
 *
 * Soma meses de calendário, não 30 dias: um treinamento anual emitido em 5 de
 * março vence em 5 de março, e não em 1º de março. `setMonth` do JavaScript já
 * trata a virada de ano sozinho.
 *
 * O caso torto é dia 31: emitido em 31 de janeiro com validade de um mês, o
 * `setMonth` empurraria para 2 ou 3 de março, porque fevereiro não tem 31.
 * Ancorar no último dia do mês evita que a validade "ganhe" dias.
 */
export function venceEm(emitidoEm: Date, validadeMeses: number): Date {
  const alvo = new Date(emitidoEm.getTime());
  const diaOriginal = alvo.getUTCDate();

  alvo.setUTCMonth(alvo.getUTCMonth() + validadeMeses);

  // Passou do mês pretendido: o dia não existia lá. Volta para o último dia
  // do mês certo.
  if (alvo.getUTCDate() < diaOriginal) {
    alvo.setUTCDate(0);
  }

  return alvo;
}

/** A situação de um certificado, como função pura. */
export function situacaoDaReciclagem(entrada: {
  emitidoEm: Date;
  validadeMeses: number;
  agora: Date;
}): { situacao: SituacaoDeReciclagem; venceEm: Date; diasRestantes: number } {
  const vencimento = venceEm(entrada.emitidoEm, entrada.validadeMeses);
  const diasRestantes = Math.ceil(
    (vencimento.getTime() - entrada.agora.getTime()) / DIA_EM_MS
  );

  const situacao: SituacaoDeReciclagem =
    diasRestantes < 0
      ? "vencido"
      : diasRestantes <= DIAS_DE_ALERTA_RECICLAGEM
        ? "vencendo"
        : "vigente";

  return { situacao, venceEm: vencimento, diasRestantes };
}

export function resumirReciclagem(linhas: LinhaDeReciclagem[]): ResumoDeReciclagem {
  const resumo: ResumoDeReciclagem = { total: linhas.length, vigente: 0, vencendo: 0, vencido: 0 };
  for (const linha of linhas) resumo[linha.situacao] += 1;
  return resumo;
}

/**
 * Levanta todo certificado sujeito a validade.
 *
 * Só entra certificado de curso que é obrigatório COM validade em algum
 * departamento da pessoa — principal ou adicional, a mesma regra da matrícula
 * automática. Um curso opcional que alguém fez por interesse não gera dívida
 * de reciclagem, e incluí-lo encheria a lista de cobrança que ninguém deve.
 */
export async function levantarReciclagem(
  filtro: { departamentoId?: string } = {},
  agora = new Date()
): Promise<{ linhas: LinhaDeReciclagem[]; resumo: ResumoDeReciclagem }> {
  const obrigatorios = await db.cursoObrigatorio.findMany({
    where: {
      validadeMeses: { not: null },
      ...(filtro.departamentoId ? { departmentId: filtro.departamentoId } : {}),
    },
    select: { courseId: true, departmentId: true, validadeMeses: true },
  });

  if (obrigatorios.length === 0) {
    return { linhas: [], resumo: resumirReciclagem([]) };
  }

  /*
    Um mesmo curso pode ser obrigatório em vários setores, com validades
    diferentes. Vale a MAIS CURTA: se um setor exige reciclagem anual e outro
    bienal, quem está nos dois precisa atender ao mais exigente — o contrário
    deixaria a pessoa irregular no setor rigoroso sem nada apontar isso.
  */
  const validadePorCurso = new Map<string, number>();
  const setoresPorCurso = new Map<string, Set<string>>();

  for (const o of obrigatorios) {
    const atual = validadePorCurso.get(o.courseId);
    validadePorCurso.set(o.courseId, Math.min(atual ?? Infinity, o.validadeMeses!));
    if (!setoresPorCurso.has(o.courseId)) setoresPorCurso.set(o.courseId, new Set());
    setoresPorCurso.get(o.courseId)!.add(o.departmentId);
  }

  const certificados = await db.certificate.findMany({
    where: {
      courseId: { in: [...validadePorCurso.keys()] },
      user: { active: true, role: "EMPLOYEE" },
    },
    select: {
      userId: true,
      courseId: true,
      issuedAt: true,
      user: {
        select: {
          departmentId: true,
          departamentosExtras: { select: { departmentId: true } },
        },
      },
    },
  });

  const linhas: LinhaDeReciclagem[] = [];

  for (const cert of certificados) {
    const setoresDaPessoa = new Set([
      ...(cert.user.departmentId ? [cert.user.departmentId] : []),
      ...cert.user.departamentosExtras.map((d) => d.departmentId),
    ]);

    // A obrigatoriedade tem de alcançar ESTA pessoa: quem deixou o setor não
    // deve mais a reciclagem daquele setor.
    const alcanca = [...(setoresPorCurso.get(cert.courseId) ?? [])].some((s) =>
      setoresDaPessoa.has(s)
    );
    if (!alcanca) continue;

    const validadeMeses = validadePorCurso.get(cert.courseId)!;
    const { situacao, venceEm: vencimento, diasRestantes } = situacaoDaReciclagem({
      emitidoEm: cert.issuedAt,
      validadeMeses,
      agora,
    });

    linhas.push({
      userId: cert.userId,
      courseId: cert.courseId,
      emitidoEm: cert.issuedAt,
      venceEm: vencimento,
      diasRestantes,
      situacao,
      validadeMeses,
    });
  }

  // Vencido primeiro, e dentro de cada grupo o mais antigo antes.
  const PESO: Record<SituacaoDeReciclagem, number> = { vencido: 0, vencendo: 1, vigente: 2 };
  linhas.sort(
    (a, b) => PESO[a.situacao] - PESO[b.situacao] || a.diasRestantes - b.diasRestantes
  );

  return { linhas, resumo: resumirReciclagem(linhas) };
}
