"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import {
  bloqueioDeCurso,
  bloqueioDeVinculo,
  ehProprietario,
  type Recusa,
} from "@/lib/alcance-admin";
import { sincronizarTrilha } from "@/lib/matricula-automatica";
import { renumerarDegraus } from "@/lib/trilhas";
import type { ActionResult } from "@/lib/actions/employees";

const trilhaSchema = z.object({
  titulo: z.string().min(3, "Informe um título para a trilha."),
  descricao: z.string().optional(),
  departmentId: z.string().optional(),
});

/**
 * Quem pode mexer nesta trilha.
 *
 * Mesma regra do curso, do documento e da prova: administrador de setor
 * alcança o que pertence aos setores dele; o que é da rede — sem departamento
 * dono — é do proprietário. Sem isso, qualquer administrador de setor criaria
 * uma trilha para a empresa inteira.
 */
async function bloqueioDaTrilha(trilhaId: string, adminId: string): Promise<Recusa | null> {
  const trilha = await db.trilha.findUnique({
    where: { id: trilhaId },
    select: { departmentId: true },
  });
  if (!trilha) return { ok: false, error: "Trilha não encontrada." };

  if (trilha.departmentId === null) {
    return (await ehProprietario(adminId))
      ? null
      : {
          ok: false,
          error: "Trilha sem departamento vale para a rede inteira; só o proprietário a altera.",
        };
  }
  return bloqueioDeVinculo(adminId, trilha.departmentId);
}

export async function criarTrilha(formData: FormData): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdmin();

  const parsed = trilhaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    departmentId: formData.get("departmentId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const departmentId = parsed.data.departmentId || null;

  if (departmentId === null) {
    if (!(await ehProprietario(admin.id))) {
      return {
        ok: false,
        error: "Trilha sem departamento vale para a rede inteira; só o proprietário pode criá-la.",
      };
    }
  } else {
    const bloqueio = await bloqueioDeVinculo(admin.id, departmentId);
    if (bloqueio) return bloqueio;
  }

  const trilha = await db.trilha.create({
    data: {
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao ?? null,
      departmentId,
      createdById: admin.id,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_TRILHA",
    targetType: "Trilha",
    targetId: trilha.id,
    details: trilha.titulo,
  });

  revalidatePath("/admin/trilhas");
  return { ok: true, id: trilha.id };
}

/**
 * Acrescenta um curso ao fim da trilha.
 *
 * Confere o alcance do CURSO também, e não só o da trilha. Sem isso, um
 * administrador de setor montaria a própria trilha com o curso de outro
 * departamento e o liberaria para a equipe dele pela porta da matrícula
 * automática — sem nunca ter tido permissão de abrir aquele curso. É o mesmo
 * furo que `bloqueioDeUsoDeProva` fechou nas provas.
 */
export async function adicionarCursoNaTrilha(
  trilhaId: string,
  courseId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio =
    (await bloqueioDaTrilha(trilhaId, admin.id)) ?? (await bloqueioDeCurso(courseId, admin.id));
  if (bloqueio) return bloqueio;

  const curso = await db.course.findUnique({
    where: { id: courseId },
    select: { title: true, status: true },
  });
  if (!curso) return { ok: false, error: "Curso não encontrado." };

  /*
    Rascunho não entra. Um degrau que a pessoa não consegue abrir trava a
    trilha inteira para todo mundo atrás dele, e o sintoma — "a trilha parou" —
    não aponta para a causa.
  */
  if (curso.status !== "PUBLISHED") {
    return { ok: false, error: `"${curso.title}" ainda é rascunho. Publique o curso antes.` };
  }

  const jaTem = await db.trilhaCurso.findUnique({
    where: { trilhaId_courseId: { trilhaId, courseId } },
    select: { id: true },
  });
  if (jaTem) return { ok: false, error: `"${curso.title}" já está nesta trilha.` };

  const ultimo = await db.trilhaCurso.findFirst({
    where: { trilhaId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  await db.trilhaCurso.create({
    data: { trilhaId, courseId, ordem: (ultimo?.ordem ?? -1) + 1 },
  });

  /*
    Trilha já publicada matricula na hora. Sem isto, o curso acrescentado hoje
    só alcançaria quem entrasse no setor amanhã, e a equipe atual ficaria com
    uma trilha de cinco degraus e matrícula em quatro.
  */
  await sincronizarTrilha(trilhaId, admin.id);

  revalidatePath("/admin/trilhas");
  revalidatePath("/trilhas");
  return { ok: true };
}

export async function removerCursoDaTrilha(
  trilhaId: string,
  courseId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaTrilha(trilhaId, admin.id);
  if (bloqueio) return bloqueio;

  await db.trilhaCurso.deleteMany({ where: { trilhaId, courseId } });

  /*
    Tirar o degrau NÃO desmatricula ninguém, pela regra de ouro da matrícula
    automática: só criar, nunca remover. Quem já começou o curso mantém
    progresso e certificado — a trilha deixa de apontar para ele, e o curso
    segue na lista de cursos da pessoa.
  */
  const restantes = await db.trilhaCurso.findMany({
    where: { trilhaId },
    orderBy: { ordem: "asc" },
    select: { id: true, ordem: true },
  });
  for (const [indice, degrau] of restantes.entries()) {
    if (degrau.ordem !== indice) {
      await db.trilhaCurso.update({ where: { id: degrau.id }, data: { ordem: indice } });
    }
  }

  revalidatePath("/admin/trilhas");
  revalidatePath("/trilhas");
  return { ok: true };
}

/** Reordena os degraus. Recebe os ids na ordem desejada. */
export async function reordenarTrilha(
  trilhaId: string,
  idsNaOrdem: string[]
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaTrilha(trilhaId, admin.id);
  if (bloqueio) return bloqueio;

  const atuais = await db.trilhaCurso.findMany({
    where: { trilhaId },
    select: { id: true, ordem: true },
  });

  /*
    A renumeração inteira, e não só os que mudaram: é o que impede buraco e
    empate na ordem depois de várias trocas. `ordem` não é única justamente
    porque, no meio de uma reordenação, dois degraus passam pelo mesmo número.
  */
  for (const degrau of renumerarDegraus(atuais, idsNaOrdem)) {
    await db.trilhaCurso.update({ where: { id: degrau.id }, data: { ordem: degrau.ordem } });
  }

  revalidatePath("/admin/trilhas");
  revalidatePath("/trilhas");
  return { ok: true };
}

/**
 * Atribui (ou reajusta o prazo d)a trilha a um departamento.
 *
 * Atribuir é o que MATRICULA gente. Por isso confere o alcance do
 * departamento: um administrador da Recepção não pode empurrar a trilha dele
 * para a Governança.
 */
export async function atribuirTrilha(
  trilhaId: string,
  departmentId: string,
  prazoDias: number | null
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio =
    (await bloqueioDaTrilha(trilhaId, admin.id)) ??
    (await bloqueioDeVinculo(admin.id, departmentId));
  if (bloqueio) return bloqueio;

  await db.trilhaDepartamento.upsert({
    where: { trilhaId_departmentId: { trilhaId, departmentId } },
    create: { trilhaId, departmentId, prazoDias },
    update: { prazoDias },
  });

  await sincronizarTrilha(trilhaId, admin.id);

  revalidatePath("/admin/trilhas");
  revalidatePath("/trilhas");
  return { ok: true };
}

export async function desatribuirTrilha(
  trilhaId: string,
  departmentId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaTrilha(trilhaId, admin.id);
  if (bloqueio) return bloqueio;

  // Não desmatricula: a regra de ouro vale aqui também. A trilha some da tela
  // do setor; o que a equipe já devia, continua devendo.
  await db.trilhaDepartamento.deleteMany({ where: { trilhaId, departmentId } });

  revalidatePath("/admin/trilhas");
  revalidatePath("/trilhas");
  return { ok: true };
}

/**
 * Publica ou despublica a trilha.
 *
 * Publicar é o ato que matricula: até aqui a trilha era rascunho e não
 * alcançava ninguém. Despublicar tira da tela sem desmatricular — é o mesmo
 * par do documento, e pela mesma razão.
 */
export async function publicarTrilha(
  trilhaId: string,
  publicada: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaTrilha(trilhaId, admin.id);
  if (bloqueio) return bloqueio;

  const trilha = await db.trilha.findUnique({
    where: { id: trilhaId },
    select: { titulo: true },
  });
  const degraus = await db.trilhaCurso.count({ where: { trilhaId } });
  if (publicada && degraus === 0) {
    return { ok: false, error: "Adicione ao menos um curso antes de publicar a trilha." };
  }

  await db.trilha.update({ where: { id: trilhaId }, data: { publicada } });

  if (publicada) await sincronizarTrilha(trilhaId, admin.id);

  await logAdminActivity({
    adminId: admin.id,
    action: publicada ? "PUBLICAR_TRILHA" : "DESPUBLICAR_TRILHA",
    targetType: "Trilha",
    targetId: trilhaId,
    details: trilha?.titulo ?? trilhaId,
  });

  revalidatePath("/admin/trilhas");
  revalidatePath("/trilhas");
  return { ok: true };
}

/**
 * Exclui a trilha.
 *
 * Só rascunho e sem atribuição. Uma trilha publicada já matriculou gente, e
 * apagá-la deixaria as matrículas órfãs — sem nada na tela explicando por que
 * aqueles cinco cursos apareceram na lista da pessoa. Despublicar é o caminho.
 */
export async function excluirTrilha(trilhaId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaTrilha(trilhaId, admin.id);
  if (bloqueio) return bloqueio;

  const trilha = await db.trilha.findUnique({
    where: { id: trilhaId },
    select: { titulo: true, publicada: true, _count: { select: { departamentos: true } } },
  });
  if (!trilha) return { ok: false, error: "Trilha não encontrada." };

  if (trilha.publicada) {
    return { ok: false, error: "Despublique a trilha antes de excluí-la." };
  }
  if (trilha._count.departamentos > 0) {
    return {
      ok: false,
      error: "Esta trilha está atribuída a um ou mais setores. Remova as atribuições primeiro.",
    };
  }

  await db.trilha.delete({ where: { id: trilhaId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_TRILHA",
    targetType: "Trilha",
    targetId: trilhaId,
    details: trilha.titulo,
  });

  revalidatePath("/admin/trilhas");
  return { ok: true };
}
