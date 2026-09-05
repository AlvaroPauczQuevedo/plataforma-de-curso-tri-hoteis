/**
 * O documento que um auditor pede.
 *
 * A pergunta dele não é "como vai o treinamento" — é **"prove que esta equipe
 * está treinada nisto"**. As telas existentes respondem outra coisa: os
 * Relatórios mostram percentuais consolidados, a Conformidade mostra o que
 * falta. Nenhuma das duas produz a folha que se entrega e se assina.
 *
 * Por isso a organização aqui é **departamento → treinamento obrigatório →
 * pessoa**, e não por pessoa: a auditoria chega perguntando de uma norma
 * ("manipulação de alimentos, cozinha"), não de um funcionário.
 *
 * O código do certificado entra em cada linha de propósito. É o que transforma
 * o papel de afirmação em prova: quem recebe confere qualquer linha em
 * `/validar`, sem login, e vê a mesma informação saindo da fonte.
 */
import { db } from "@/lib/db";
import { situacaoDaReciclagem } from "@/lib/reciclagem";

export type SituacaoDeAuditoria = "concluido" | "vencido" | "pendente" | "atrasado";

export type PessoaAuditada = {
  nome: string;
  username: string;
  situacao: SituacaoDeAuditoria;
  /** Quando concluiu. Nulo para quem não concluiu. */
  concluidoEm: Date | null;
  /** Código de conferência pública. Nulo sem certificado. */
  codigo: string | null;
  /** Só quando o treinamento tem reciclagem. */
  venceEm: Date | null;
  /** Prazo da matrícula, para quem ainda não concluiu. */
  prazo: Date | null;
};

export type BlocoDeAuditoria = {
  departamento: string;
  curso: string;
  validadeMeses: number | null;
  prazoDias: number | null;
  pessoas: PessoaAuditada[];
  /** Quantos estão regulares — concluído e dentro da validade. */
  regulares: number;
};

export type RelatorioDeAuditoria = {
  geradoEm: Date;
  departamentoFiltrado: string | null;
  blocos: BlocoDeAuditoria[];
  total: number;
  regulares: number;
};

/**
 * Monta o relatório.
 *
 * Só treinamento OBRIGATÓRIO entra. Curso opcional que alguém fez por
 * interesse não é objeto de auditoria, e listá-lo inflaria o documento até
 * esconder o que importa.
 */
export async function levantarAuditoria(
  filtro: { departamentoId?: string } = {},
  agora = new Date()
): Promise<RelatorioDeAuditoria> {
  const obrigatorios = await db.cursoObrigatorio.findMany({
    where: filtro.departamentoId ? { departmentId: filtro.departamentoId } : {},
    select: {
      courseId: true,
      departmentId: true,
      prazoDias: true,
      validadeMeses: true,
      course: { select: { title: true } },
      department: { select: { name: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { course: { title: "asc" } }],
  });

  const blocos: BlocoDeAuditoria[] = [];
  let total = 0;
  let regulares = 0;

  for (const o of obrigatorios) {
    /*
      Quem pertence ao setor pelo campo principal OU pelos adicionais — a
      mesma regra da matrícula automática. Considerar só o principal deixaria
      de fora justamente quem atua em dois setores, que é quem mais costuma
      dever treinamento.
    */
    const pessoas = await db.user.findMany({
      where: {
        active: true,
        role: "EMPLOYEE",
        OR: [
          { departmentId: o.departmentId },
          { departamentosExtras: { some: { departmentId: o.departmentId } } },
        ],
      },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    });

    if (pessoas.length === 0) continue;

    const ids = pessoas.map((p) => p.id);

    const [certificados, matriculas] = await Promise.all([
      db.certificate.findMany({
        where: { courseId: o.courseId, userId: { in: ids } },
        select: { userId: true, code: true, issuedAt: true },
      }),
      db.enrollment.findMany({
        where: { courseId: o.courseId, userId: { in: ids } },
        select: { userId: true, dueDate: true },
      }),
    ]);

    const certPor = new Map(certificados.map((c) => [c.userId, c]));
    const prazoPor = new Map(matriculas.map((m) => [m.userId, m.dueDate]));

    const auditadas: PessoaAuditada[] = pessoas.map((p) => {
      const cert = certPor.get(p.id);
      const prazo = prazoPor.get(p.id) ?? null;

      if (cert) {
        // Concluiu. Só deixa de valer se o treinamento tiver reciclagem.
        const vencimento = o.validadeMeses
          ? situacaoDaReciclagem({
              emitidoEm: cert.issuedAt,
              validadeMeses: o.validadeMeses,
              agora,
            })
          : null;

        return {
          nome: p.name,
          username: p.username,
          situacao: vencimento?.situacao === "vencido" ? "vencido" : "concluido",
          concluidoEm: cert.issuedAt,
          codigo: cert.code,
          venceEm: vencimento?.venceEm ?? null,
          prazo,
        };
      }

      return {
        nome: p.name,
        username: p.username,
        situacao: prazo && prazo < agora ? "atrasado" : "pendente",
        concluidoEm: null,
        codigo: null,
        venceEm: null,
        prazo,
      };
    });

    const regularesDoBloco = auditadas.filter((a) => a.situacao === "concluido").length;

    blocos.push({
      departamento: o.department.name,
      curso: o.course.title,
      validadeMeses: o.validadeMeses,
      prazoDias: o.prazoDias,
      pessoas: auditadas,
      regulares: regularesDoBloco,
    });

    total += auditadas.length;
    regulares += regularesDoBloco;
  }

  const departamento = filtro.departamentoId
    ? ((await db.department.findUnique({ where: { id: filtro.departamentoId } }))?.name ?? null)
    : null;

  return { geradoEm: agora, departamentoFiltrado: departamento, blocos, total, regulares };
}
