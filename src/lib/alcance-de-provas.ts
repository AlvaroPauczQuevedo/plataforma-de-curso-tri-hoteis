/**
 * Quem alcança qual prova.
 *
 * A regra vivia copiada em quatro lugares — a lista do portal, a tela de fazer
 * a prova, o download do PDF e a entrega da tentativa — e as quatro cópias já
 * discordavam entre si: a tela de fazer a prova recusava quem a entrega
 * aceitava, e nenhuma delas enxergava departamento adicional. Discordância
 * assim aparece do pior jeito possível: a prova listada, aberta, respondida, e
 * a recusa só no clique de entregar.
 *
 * Duas portas levam à mesma prova, e as duas valem:
 *
 *  - **por departamento**: a prova é geral (sem departamento, escrita para a
 *    empresa toda) ou pertence a um dos departamentos da pessoa — o principal
 *    ou um adicional. Os adicionais contam aqui pelo mesmo motivo que contam
 *    na matrícula automática: quem atua em dois setores precisa do treinamento
 *    dos dois, e a prova é parte do treinamento.
 *  - **por curso**: a prova é aula de um curso em que a pessoa está
 *    matriculada. Matrícula atravessa departamento — um curso do Trainee pode
 *    ter aluno de outro setor —, e sem esta porta a pessoa veria a prova na
 *    aula e tomaria recusa ao entregar.
 *
 * Publicação NÃO é conferida aqui, de propósito: é uma pergunta diferente
 * ("esta prova está no ar?") e quem chama trata dela de forma diferente — o
 * administrador baixa o PDF de uma prova em rascunho para revisá-la antes de
 * liberar, e o funcionário não.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** O principal e os adicionais numa lista só, sem repetição. */
export async function departamentosDoUsuario(userId: string): Promise<string[]> {
  const conta = await db.user.findUnique({
    where: { id: userId },
    select: {
      departmentId: true,
      departamentosExtras: { select: { departmentId: true } },
    },
  });
  if (!conta) return [];

  return [
    ...new Set([
      ...(conta.departmentId ? [conta.departmentId] : []),
      ...conta.departamentosExtras.map((d) => d.departmentId),
    ]),
  ];
}

/**
 * As duas portas como filtro de consulta, para listar sem trazer o que a
 * pessoa não alcança.
 *
 * Existe em paralelo a usuarioAlcancaProva porque listar e conferir são
 * operações diferentes: uma precisa virar SQL, a outra responde sobre uma
 * prova só. As duas descrevem a MESMA regra, e é por isso que moram juntas —
 * separadas, um dia divergiriam.
 */
export function filtroDeProvasDoUsuario(
  userId: string,
  departamentos: string[]
): Prisma.ProvaWhereInput {
  return {
    OR: [
      { departmentId: null },
      { departmentId: { in: departamentos } },
      { aulas: { some: { module: { course: { enrollments: { some: { userId } } } } } } },
    ],
  };
}

/** Esta pessoa alcança esta prova? */
export async function usuarioAlcancaProva(
  userId: string,
  prova: { id: string; departmentId: string | null }
): Promise<boolean> {
  // Prova geral vale para todo mundo; nem precisa consultar o departamento.
  if (prova.departmentId === null) return true;

  const departamentos = await departamentosDoUsuario(userId);
  if (departamentos.includes(prova.departmentId)) return true;

  const aulas = await db.lesson.count({
    where: {
      provaId: prova.id,
      module: { course: { enrollments: { some: { userId } } } },
    },
  });
  return aulas > 0;
}
