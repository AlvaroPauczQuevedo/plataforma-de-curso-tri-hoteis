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
  type Ator,
  motivoDeBloqueio,
  motivoDeBloqueioDeCurso,
  motivoDeBloqueioDeProva,
  motivoDeVinculoDeCursoInvalido,
  motivoDeVinculoDeProvaInvalido,
  motivoDeVinculoInvalido,
} from "@/lib/permissoes-usuario";

export type Recusa = { ok: false; error: string };

const CAMPOS = {
  id: true,
  protegido: true,
  departmentId: true,
  departamentosExtras: { select: { departmentId: true } },
} as const;

/**
 * Junta o departamento principal e os adicionais numa lista só.
 *
 * Para decidir alcance os dois valem igual, e reuni-los aqui evita que cada
 * chamador lembre de somar — esquecer um lugar seria abrir um furo silencioso
 * na hierarquia.
 */
function comoAtor(u: {
  id: string;
  protegido: boolean;
  departmentId: string | null;
  departamentosExtras: { departmentId: string }[];
}): Ator {
  return {
    id: u.id,
    protegido: u.protegido,
    departamentos: [
      ...(u.departmentId ? [u.departmentId] : []),
      ...u.departamentosExtras.map((d) => d.departmentId),
    ],
  };
}

/** Carrega o ator já com o alcance montado. Use isto nas telas. */
export async function carregarAtor(userId: string): Promise<Ator | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: CAMPOS });
  return u ? comoAtor(u) : null;
}

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

  const motivo = motivoDeBloqueio(alvo, comoAtor(ator));
  return motivo ? { ok: false, error: motivo } : null;
}

/**
 * Igual à anterior, para uma lista — usada na matrícula em massa.
 *
 * Duas consultas no total, e não duas por pessoa: antes isto chamava
 * `bloqueioDeAlteracao` num laço, e cada volta recarregava o MESMO ator do
 * banco. Matricular cinquenta pessoas custava cem consultas para responder
 * uma pergunta que só muda de alvo.
 *
 * A recusa continua sendo a primeira encontrada, e a ordem de `alvoIds` é
 * respeitada: quem dispara a ação precisa ver sempre a mesma mensagem para
 * a mesma seleção.
 */
export async function bloqueioDeAlteracaoEmLote(
  alvoIds: string[],
  atorId: string
): Promise<Recusa | null> {
  const outros = alvoIds.filter((id) => id !== atorId);
  if (outros.length === 0) return null;

  const [alvos, ator] = await Promise.all([
    db.user.findMany({
      where: { id: { in: outros } },
      select: { ...CAMPOS, name: true },
    }),
    db.user.findUnique({ where: { id: atorId }, select: CAMPOS }),
  ]);

  if (!ator) return { ok: false, error: "Sessão inválida." };

  const porId = new Map(alvos.map((a) => [a.id, a]));
  const comAlcance = comoAtor(ator);

  for (const alvoId of outros) {
    const alvo = porId.get(alvoId);
    if (!alvo) return { ok: false, error: "Usuário não encontrado." };

    const motivo = motivoDeBloqueio(alvo, comAlcance);
    if (motivo) return { ok: false, error: motivo };
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

  const motivo = motivoDeVinculoInvalido(comoAtor(ator), departmentId);
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

  const motivo = motivoDeBloqueioDeCurso(curso, comoAtor(ator));
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

  const motivo = motivoDeVinculoDeCursoInvalido(comoAtor(ator), departmentId);
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

/* ------------------------------------------------------------------ provas */

/** `null` se o administrador pode alterar esta prova. */
export async function bloqueioDeProva(
  provaId: string,
  atorId: string
): Promise<Recusa | null> {
  const [prova, ator] = await Promise.all([
    db.prova.findUnique({
      where: { id: provaId },
      select: { titulo: true, departmentId: true },
    }),
    db.user.findUnique({ where: { id: atorId }, select: CAMPOS }),
  ]);

  if (!prova) return { ok: false, error: "Prova não encontrada." };
  if (!ator) return { ok: false, error: "Sessão inválida." };

  const motivo = motivoDeBloqueioDeProva(prova, comoAtor(ator));
  return motivo ? { ok: false, error: motivo } : null;
}

/** Idem, a partir de uma questão — sobe até a prova dona. */
export async function bloqueioDeQuestao(
  questaoId: string,
  atorId: string
): Promise<Recusa | null> {
  const questao = await db.questaoProva.findUnique({
    where: { id: questaoId },
    select: { provaId: true },
  });
  if (!questao) return { ok: false, error: "Questão não encontrada." };
  return bloqueioDeProva(questao.provaId, atorId);
}

/** `null` se o administrador pode criar uma prova neste departamento. */
export async function bloqueioDeVinculoDeProva(
  atorId: string,
  departmentId: string | null
): Promise<Recusa | null> {
  const ator = await db.user.findUnique({ where: { id: atorId }, select: CAMPOS });
  if (!ator) return { ok: false, error: "Sessão inválida." };

  const motivo = motivoDeVinculoDeProvaInvalido(comoAtor(ator), departmentId);
  return motivo ? { ok: false, error: motivo } : null;
}

/**
 * Igual a `carregarAtor`, mas falha alto quando a conta não existe.
 *
 * As telas administrativas já passaram por `requireAdmin`: se o usuário sumiu
 * entre a sessão e esta consulta, seguir com um ator vazio esconderia o
 * problema atrás de uma tela sem permissão.
 */
export async function carregarAtorOuFalhar(userId: string): Promise<Ator> {
  const ator = await carregarAtor(userId);
  if (!ator) throw new Error(`Usuário ${userId} não encontrado ao montar o alcance.`);
  return ator;
}
