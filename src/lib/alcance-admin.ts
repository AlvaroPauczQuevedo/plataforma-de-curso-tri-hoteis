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
import {
  motivoDeBloqueio,
  motivoDeBloqueioDeCurso,
  motivoDeVinculoDeCursoInvalido,
  motivoDeVinculoInvalido,
} from "@/lib/permissoes-usuario";

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

/**
 * Travas de conteúdo.
 *
 * Só o curso guarda o departamento; módulo e aula chegam nele subindo a
 * hierarquia. Fosse cada nível guardar o seu, bastaria mover um módulo para
 * separar o conteúdo do dono e a regra deixaria de valer.
 */
async function recusaDeCurso(
  curso: { title: string; departmentId: string | null } | null,
  atorId: string
): Promise<Recusa | null> {
  if (!curso) return { ok: false, error: "Curso não encontrado." };

  const ator = await db.user.findUnique({ where: { id: atorId }, select: CAMPOS });
  if (!ator) return { ok: false, error: "Sessão inválida." };

  const motivo = motivoDeBloqueioDeCurso(curso, ator);
  return motivo ? { ok: false, error: motivo } : null;
}

/** `null` se o administrador pode alterar este curso. */
export async function bloqueioDeCurso(
  courseId: string,
  atorId: string
): Promise<Recusa | null> {
  const curso = await db.course.findUnique({
    where: { id: courseId },
    select: { title: true, departmentId: true },
  });
  return recusaDeCurso(curso, atorId);
}

/** Idem, a partir de um módulo — sobe até o curso dono. */
export async function bloqueioDeModulo(
  moduleId: string,
  atorId: string
): Promise<Recusa | null> {
  const mod = await db.module.findUnique({
    where: { id: moduleId },
    select: { course: { select: { title: true, departmentId: true } } },
  });
  if (!mod) return { ok: false, error: "Módulo não encontrado." };
  return recusaDeCurso(mod.course, atorId);
}

/** Idem, a partir de uma aula — sobe módulo e curso. */
export async function bloqueioDeAula(
  lessonId: string,
  atorId: string
): Promise<Recusa | null> {
  const aula = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { course: { select: { title: true, departmentId: true } } } } },
  });
  if (!aula) return { ok: false, error: "Aula não encontrada." };
  return recusaDeCurso(aula.module.course, atorId);
}

/** `null` se o administrador pode criar um curso neste departamento. */
export async function bloqueioDeVinculoDeCurso(
  atorId: string,
  departmentId: string | null
): Promise<Recusa | null> {
  const ator = await db.user.findUnique({ where: { id: atorId }, select: CAMPOS });
  if (!ator) return { ok: false, error: "Sessão inválida." };

  const motivo = motivoDeVinculoDeCursoInvalido(ator, departmentId);
  return motivo ? { ok: false, error: motivo } : null;
}

/** O departamento do administrador, para preencher o curso que ele cria. */
export async function departamentoDoAtor(atorId: string): Promise<string | null> {
  const ator = await db.user.findUnique({ where: { id: atorId }, select: CAMPOS });
  return ator?.departmentId ?? null;
}

/** O proprietário da plataforma — a conta protegida. */
export async function ehProprietario(atorId: string): Promise<boolean> {
  const ator = await db.user.findUnique({ where: { id: atorId }, select: CAMPOS });
  return ator?.protegido === true;
}
