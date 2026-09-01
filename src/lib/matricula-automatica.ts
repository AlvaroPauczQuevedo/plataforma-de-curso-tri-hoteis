/**
 * Matrícula automática por departamento.
 *
 * Um curso marcado como obrigatório para um departamento alcança todo mundo
 * que está nele — inclusive quem entrar depois. O RH deixa de matricular
 * pessoa por pessoa.
 *
 * A regra de ouro aqui é **só criar, nunca remover**. A sincronização preenche
 * o que falta e não desfaz nada:
 *
 *  - quem já está matriculado por fora continua matriculado;
 *  - quem mudou de departamento não perde o histórico do curso antigo, que
 *    pode incluir progresso e certificado já emitidos;
 *  - desmarcar a obrigatoriedade não desmatricula ninguém.
 *
 * Remover em massa seria a operação mais destrutiva da plataforma, e um clique
 * errado apagaria certificados. Quando alguém precisa sair de um curso, isso é
 * feito individualmente, com confirmação.
 */
import { db } from "@/lib/db";

export type ResultadoSincronizacao = {
  criadas: number;
  jaExistiam: number;
};

function prazoAPartirDe(agora: Date, dias: number | null): Date | null {
  if (dias === null) return null;
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
}

/**
 * Cria as matrículas que faltam para uma lista de obrigatoriedades.
 *
 * `assignedById` é quem responde pela ação no histórico — o administrador que
 * marcou a obrigatoriedade, ou quem cadastrou o funcionário.
 */
async function criarFaltantes(
  obrigatorios: { courseId: string; departmentId: string; prazoDias: number | null }[],
  assignedById: string,
  filtroDeUsuario?: { id: string }
): Promise<ResultadoSincronizacao> {
  const agora = new Date();
  let criadas = 0;
  let jaExistiam = 0;

  for (const regra of obrigatorios) {
    /*
      Só funcionários. Administradores ficam de fora de propósito: eles
      gerenciam o treinamento, e matriculá-los automaticamente encheria o
      portal deles com os cursos que eles mesmos publicaram. Quando um
      administrador precisa fazer o curso, é matriculado individualmente.
    */
    /*
      Pertencer ao departamento vale tanto pelo principal quanto por um
      adicional. Quem atua em dois setores precisa do treinamento obrigatório
      dos dois — foi para isso que os adicionais existem.
    */
    const alvos = await db.user.findMany({
      where: {
        OR: [
          { departmentId: regra.departmentId },
          { departamentosExtras: { some: { departmentId: regra.departmentId } } },
        ],
        role: "EMPLOYEE",
        active: true,
        ...(filtroDeUsuario ? { id: filtroDeUsuario.id } : {}),
      },
      select: { id: true },
    });
    if (alvos.length === 0) continue;

    const jaMatriculados = new Set(
      (
        await db.enrollment.findMany({
          where: { courseId: regra.courseId, userId: { in: alvos.map((a) => a.id) } },
          select: { userId: true },
        })
      ).map((e) => e.userId)
    );

    const novos = alvos.filter((a) => !jaMatriculados.has(a.id));
    jaExistiam += jaMatriculados.size;

    if (novos.length === 0) continue;

    await db.enrollment.createMany({
      data: novos.map((a) => ({
        userId: a.id,
        courseId: regra.courseId,
        mandatory: true,
        dueDate: prazoAPartirDe(agora, regra.prazoDias),
        assignedById,
      })),
    });
    criadas += novos.length;
  }

  return { criadas, jaExistiam };
}

/** Sincroniza um curso: matricula quem falta em todos os departamentos dele. */
export async function sincronizarCurso(
  courseId: string,
  assignedById: string
): Promise<ResultadoSincronizacao> {
  const obrigatorios = await db.cursoObrigatorio.findMany({
    where: { courseId },
    select: { courseId: true, departmentId: true, prazoDias: true },
  });
  return criarFaltantes(obrigatorios, assignedById);
}

/**
 * Sincroniza uma pessoa: matricula-a em tudo que é obrigatório no departamento
 * dela. Chamado quando alguém é cadastrado ou muda de departamento.
 */
export async function sincronizarUsuario(
  userId: string,
  assignedById: string
): Promise<ResultadoSincronizacao> {
  const usuario = await db.user.findUnique({
    where: { id: userId },
    select: {
      departmentId: true,
      active: true,
      role: true,
      departamentosExtras: { select: { departmentId: true } },
    },
  });
  if (!usuario || !usuario.active || usuario.role !== "EMPLOYEE") {
    return { criadas: 0, jaExistiam: 0 };
  }

  // Principal e adicionais, sem repetição.
  const departamentos = [
    ...new Set([
      ...(usuario.departmentId ? [usuario.departmentId] : []),
      ...usuario.departamentosExtras.map((d) => d.departmentId),
    ]),
  ];
  if (departamentos.length === 0) return { criadas: 0, jaExistiam: 0 };

  const obrigatorios = await db.cursoObrigatorio.findMany({
    where: { departmentId: { in: departamentos } },
    select: { courseId: true, departmentId: true, prazoDias: true },
  });
  return criarFaltantes(obrigatorios, assignedById, { id: userId });
}

/** Sincroniza a plataforma inteira. Usado pelo botão "Sincronizar agora". */
export async function sincronizarTudo(assignedById: string): Promise<ResultadoSincronizacao> {
  const obrigatorios = await db.cursoObrigatorio.findMany({
    select: { courseId: true, departmentId: true, prazoDias: true },
  });
  return criarFaltantes(obrigatorios, assignedById);
}
