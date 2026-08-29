/**
 * Travas de alcance, do lado do servidor.
 *
 * Buscam os registros e traduzem a decisão de `@/lib/permissoes-usuario` para
 * o formato de retorno das server actions. Ficam fora dos arquivos "use server"
 * porque lá todo export vira endpoint — e estas funções são internas.
 *
 * Toda action que altera a conta de alguém, ou o histórico de alguém, passa
 * por aqui. Proteger só o cadastro não bastaria: remover uma matrícula apaga
 * progresso e certificado da pessoa.
 */
import { db } from "@/lib/db";
import { motivoDeBloqueio, motivoDeVinculoInvalido } from "@/lib/permissoes-usuario";

export type Recusa = { ok: false; error: string };

const CAMPOS = { id: true, protegido: true, departmentId: true } as const;

/** `null` se o administrador pode alterar esta conta; a recusa, se não pode. */
export async function bloqueioDeAlteracao(
  alvoId: string,
  atorId: string
): Promise<Recusa | null> {
  if (alvoId === atorId) return null;

  const [alvo, ator] = await Promise.all([
    db.user.findUnique({ where: { id: alvoId }, select: { ...CAMPOS, name: true } }),
    db.user.findUnique({ where: { id: atorId }, select: CAMPOS }),
  ]);

  if (!alvo) return { ok: false, error: "Usuário não encontrado." };
  if (!ator) return { ok: false, error: "Sessão inválida." };

  const motivo = motivoDeBloqueio(alvo, ator);
  return motivo ? { ok: false, error: motivo } : null;
}

/** Igual à anterior, para uma lista — usada na matrícula em massa. */
export async function bloqueioDeAlteracaoEmLote(
  alvoIds: string[],
  atorId: string
): Promise<Recusa | null> {
  for (const alvoId of alvoIds) {
    const recusa = await bloqueioDeAlteracao(alvoId, atorId);
    if (recusa) return recusa;
  }
  return null;
}

/** `null` se o administrador pode vincular alguém a este departamento. */
export async function bloqueioDeVinculo(
  atorId: string,
  departmentId: string | null
): Promise<Recusa | null> {
  const ator = await db.user.findUnique({ where: { id: atorId }, select: CAMPOS });
  if (!ator) return { ok: false, error: "Sessão inválida." };

  const motivo = motivoDeVinculoInvalido(ator, departmentId);
  return motivo ? { ok: false, error: motivo } : null;
}
