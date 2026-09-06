/**
 * Quem concluiu o quê — pela plataforma OU fora dela.
 *
 * Existe para que três telas concordem. A Conformidade, a Reciclagem e o
 * relatório de auditoria fazem a mesma pergunta ("esta pessoa cumpriu este
 * treinamento?") e, antes disto, cada uma respondia consultando um lugar
 * diferente: progresso do curso, certificado emitido, certificado emitido de
 * novo. Bastava acrescentar uma quarta origem — o treinamento presencial —
 * para as três divergirem.
 *
 * E divergência aqui aparece do pior jeito possível: a tela dizendo doze
 * pendentes e o relatório dizendo nove, sem ninguém saber qual vale. É o mesmo
 * motivo que tirou a regra de conformidade de dentro da página, na época do
 * resumo semanal.
 *
 * ---
 *
 * **Por que o presencial não emite certificado da plataforma.**
 *
 * Ela não pode certificar o que não entregou — não viu a aula acontecer, não
 * corrigiu prova nenhuma. O comprovante daquele treinamento é o documento de
 * quem o aplicou, anexado ao registro.
 *
 * Mas para conformidade e reciclagem **vale como conclusão**, porque a
 * pergunta ali é outra: não "a plataforma ensinou?", e sim "a pessoa está
 * treinada?". Ignorar o presencial fazia a Conformidade cobrar quem já tinha
 * feito o curso, e o relatório de auditoria sair incompleto afirmando estar
 * completo.
 */
import { db } from "@/lib/db";

export type OrigemDaConclusao = "plataforma" | "externa";

export type Conclusao = {
  userId: string;
  courseId: string;
  /** Data em que a pessoa concluiu. É dela que a reciclagem conta a validade. */
  em: Date;
  origem: OrigemDaConclusao;
  /** Código de conferência pública. Só existe no que a plataforma emitiu. */
  codigo: string | null;
  /** Quem aplicou o treinamento presencial. Nulo no que veio da plataforma. */
  instrutor: string | null;
};

/** A chave que identifica um par pessoa-curso nos mapas abaixo. */
export function chaveDeConclusao(userId: string, courseId: string): string {
  return `${userId}:${courseId}`;
}

/**
 * Levanta as conclusões de um conjunto de cursos, das duas origens.
 *
 * Recebe os cursos, e não os pares, porque é assim que as três chamadoras
 * têm a informação: elas partem de "os cursos obrigatórios" e só depois
 * cruzam com as pessoas.
 *
 * Quando a mesma pessoa tem as duas — fez presencialmente e depois refez aqui,
 * ou o contrário — vale a **mais recente**. É a que reflete o estado atual do
 * treinamento, e é dela que a validade deve contar; escolher a mais antiga
 * marcaria como vencido quem acabou de reciclar.
 */
export async function conclusoesPorCurso(courseIds: string[]): Promise<Map<string, Conclusao>> {
  const mapa = new Map<string, Conclusao>();
  if (courseIds.length === 0) return mapa;

  const [certificados, externas] = await Promise.all([
    db.certificate.findMany({
      where: { courseId: { in: courseIds } },
      select: { userId: true, courseId: true, issuedAt: true, code: true },
    }),
    db.conclusaoExterna.findMany({
      where: { courseId: { in: courseIds } },
      select: { userId: true, courseId: true, concluidoEm: true, instrutor: true },
    }),
  ]);

  for (const c of certificados) {
    mapa.set(chaveDeConclusao(c.userId, c.courseId), {
      userId: c.userId,
      courseId: c.courseId,
      em: c.issuedAt,
      origem: "plataforma",
      codigo: c.code,
      instrutor: null,
    });
  }

  for (const e of externas) {
    const chave = chaveDeConclusao(e.userId, e.courseId);
    const jaTem = mapa.get(chave);

    // A mais recente vence. Ver a nota no cabeçalho da função.
    if (jaTem && jaTem.em >= e.concluidoEm) continue;

    mapa.set(chave, {
      userId: e.userId,
      courseId: e.courseId,
      em: e.concluidoEm,
      origem: "externa",
      codigo: null,
      instrutor: e.instrutor,
    });
  }

  return mapa;
}
