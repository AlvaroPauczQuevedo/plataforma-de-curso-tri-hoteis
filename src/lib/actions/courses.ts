"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ressincronizarProgressoDoCurso } from "@/lib/progress";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import type { ActionResult } from "@/lib/actions/employees";
import {
  bloqueioDeAula,
  bloqueioDeCurso,
  bloqueioDeModulo,
  bloqueioDeVinculoDeCurso,
  departamentoDoAtor,
  ehProprietario,
} from "@/lib/alcance-admin";

const courseSchema = z.object({
  title: z.string().min(3, "Informe o título do curso."),
  description: z.string().min(5, "Informe a descrição do curso."),
  categoryId: z.string().optional(),
  instructor: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(0).default(0),
  difficulty: z.enum(["INICIANTE", "INTERMEDIARIO", "AVANCADO"]).default("INICIANTE"),
  sequential: z.coerce.boolean().default(false),
  allowDownload: z.coerce.boolean().default(true),
  certificateEnabled: z.coerce.boolean().default(true),
  videoCompletionThreshold: z.coerce.number().int().min(50).max(100).default(90),
  departmentId: z.string().optional(),
});

function boolFromForm(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export async function createCourse(formData: FormData): Promise<ActionResult & { courseId?: string }> {
  const admin = await requireAdmin();

  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || undefined,
    instructor: formData.get("instructor") || undefined,
    durationMinutes: formData.get("durationMinutes") || 0,
    difficulty: formData.get("difficulty") || "INICIANTE",
    sequential: boolFromForm(formData, "sequential"),
    allowDownload: boolFromForm(formData, "allowDownload"),
    certificateEnabled: boolFromForm(formData, "certificateEnabled"),
    videoCompletionThreshold: formData.get("videoCompletionThreshold") || 90,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // O curso nasce no departamento de quem o cria. O proprietário não tem
  // departamento, e os cursos dele ficam sem dono até que alguém seja atribuído.
  const departmentId = await departamentoDoAtor(admin.id);
  const vinculo = await bloqueioDeVinculoDeCurso(admin.id, departmentId);
  if (vinculo) return vinculo;

  const coverFileId = (formData.get("coverFileId") as string) || undefined;

  const course = await db.course.create({
    data: {
      ...parsed.data,
      categoryId: parsed.data.categoryId || null,
      coverFileId: coverFileId || null,
      departmentId,
      createdById: admin.id,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_CURSO",
    targetType: "Course",
    targetId: course.id,
    details: course.title,
  });

  revalidatePath("/admin/cursos");
  return { ok: true, courseId: course.id };
}

export async function updateCourse(courseId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || undefined,
    instructor: formData.get("instructor") || undefined,
    durationMinutes: formData.get("durationMinutes") || 0,
    difficulty: formData.get("difficulty") || "INICIANTE",
    sequential: boolFromForm(formData, "sequential"),
    allowDownload: boolFromForm(formData, "allowDownload"),
    certificateEnabled: boolFromForm(formData, "certificateEnabled"),
    videoCompletionThreshold: formData.get("videoCompletionThreshold") || 90,
    departmentId: formData.get("departmentId") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  /*
    Trocar o curso de departamento é entregá-lo a outro time. Quem não pode
    criar conteúdo lá também não pode empurrar um curso para lá.

    Mas só o proprietário escolhe o departamento: para os demais o campo nem
    aparece no formulário. Ler o campo ausente como `null` seria interpretá-lo
    como "mover o curso para nenhum departamento" — exatamente o que a trava
    abaixo recusa. O efeito era o administrador não conseguir salvar alteração
    nenhuma no próprio curso, recebendo "Você só pode criar cursos no seu
    próprio departamento" ao mexer em qualquer outro campo.

    Para quem não é proprietário, o destino é o departamento que o curso já
    tem — e `bloqueioDeCurso`, acima, já provou que é o dele.
  */
  const [proprietario, atual] = await Promise.all([
    ehProprietario(admin.id),
    db.course.findUnique({ where: { id: courseId }, select: { departmentId: true } }),
  ]);

  const destino = proprietario
    ? parsed.data.departmentId || null
    : atual?.departmentId ?? null;

  const vinculo = await bloqueioDeVinculoDeCurso(admin.id, destino);
  if (vinculo) return vinculo;

  const coverFileId = (formData.get("coverFileId") as string) || undefined;

  await db.course.update({
    where: { id: courseId },
    data: {
      ...parsed.data,
      categoryId: parsed.data.categoryId || null,
      departmentId: destino,
      ...(coverFileId ? { coverFileId } : {}),
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "EDITAR_CURSO",
    targetType: "Course",
    targetId: courseId,
  });

  revalidatePath("/admin/cursos");
  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true, message: "Curso atualizado com sucesso." };
}

export async function setCourseStatus(
  courseId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  if (status === "PUBLISHED") {
    const course = await db.course.findUnique({
      where: { id: courseId },
      include: { modules: { include: { lessons: true } } },
    });
    const hasLessons = course?.modules.some((m) => m.lessons.length > 0);
    if (!hasLessons) {
      return { ok: false, error: "Adicione ao menos um módulo com uma aula antes de publicar." };
    }
  }

  await db.course.update({ where: { id: courseId }, data: { status } });

  await logAdminActivity({
    adminId: admin.id,
    action: `CURSO_${status}`,
    targetType: "Course",
    targetId: courseId,
  });

  revalidatePath("/admin/cursos");
  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true };
}

export async function duplicateCourse(courseId: string): Promise<ActionResult & { courseId?: string }> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: true }, orderBy: { order: "asc" } } },
  });
  if (!course) return { ok: false, error: "Curso não encontrado." };

  const newCourse = await db.course.create({
    data: {
      title: `${course.title} (cópia)`,
      description: course.description,
      categoryId: course.categoryId,
      instructor: course.instructor,
      coverFileId: course.coverFileId,
      durationMinutes: course.durationMinutes,
      difficulty: course.difficulty,
      status: "DRAFT",
      sequential: course.sequential,
      allowDownload: course.allowDownload,
      certificateEnabled: course.certificateEnabled,
      videoCompletionThreshold: course.videoCompletionThreshold,
      departmentId: await departamentoDoAtor(admin.id),
      createdById: admin.id,
      modules: {
        create: course.modules.map((m) => ({
          title: m.title,
          order: m.order,
          lessons: {
            create: m.lessons.map((l) => ({
              title: l.title,
              order: l.order,
              type: l.type,
              required: l.required,
              videoSource: l.videoSource,
              videoFileId: l.videoFileId,
              videoEmbedUrl: l.videoEmbedUrl,
              videoDurationSeconds: l.videoDurationSeconds,
              pdfFileId: l.pdfFileId,
              textContent: l.textContent,
              provaId: l.provaId,
            })),
          },
        })),
      },
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "DUPLICAR_CURSO",
    targetType: "Course",
    targetId: newCourse.id,
    details: `Duplicado de ${course.title}`,
  });

  revalidatePath("/admin/cursos");
  return { ok: true, courseId: newCourse.id };
}

export async function deleteCourse(courseId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return { ok: false, error: "Curso não encontrado." };

  await db.course.delete({ where: { id: courseId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_CURSO",
    targetType: "Course",
    targetId: courseId,
    details: course.title,
  });

  revalidatePath("/admin/cursos");
  return { ok: true };
}

export async function createCategory(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!name?.trim()) return { ok: false, error: "Informe o nome da categoria." };

  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const existing = await db.category.findFirst({ where: { OR: [{ name: name.trim() }, { slug }] } });
  if (existing) return { ok: false, error: "Categoria já existe." };

  await db.category.create({ data: { name: name.trim(), slug } });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_CATEGORIA",
    targetType: "Category",
    details: name,
  });

  revalidatePath("/admin/cursos");
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

// ---------- Módulos ----------

export async function createModule(courseId: string, title: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  if (!title?.trim()) return { ok: false, error: "Informe o título do módulo." };

  const count = await db.module.count({ where: { courseId } });
  await db.module.create({ data: { courseId, title: title.trim(), order: count } });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_MODULO",
    targetType: "Course",
    targetId: courseId,
    details: title,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true };
}

export async function updateModuleTitle(moduleId: string, title: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeModulo(moduleId, admin.id);
  if (bloqueio) return bloqueio;

  if (!title?.trim()) return { ok: false, error: "Informe o título do módulo." };

  const mod = await db.module.update({ where: { id: moduleId }, data: { title: title.trim() } });
  revalidatePath(`/admin/cursos/${mod.courseId}`);
  return { ok: true };
}

export async function deleteModule(moduleId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeModulo(moduleId, admin.id);
  if (bloqueio) return bloqueio;

  const mod = await db.module.delete({ where: { id: moduleId } });
  await ressincronizarProgressoDoCurso(mod.courseId);
  revalidatePath(`/admin/cursos/${mod.courseId}`);
  return { ok: true };
}

export async function reorderModules(courseId: string, orderedIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.module.update({ where: { id }, data: { order: index } })
    )
  );
  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true };
}

// ---------- Aulas ----------

const lessonSchema = z.object({
  title: z.string().min(2, "Informe o título da aula."),
  type: z.enum(["VIDEO", "PDF", "TEXT", "PROVA"]),
  required: z.coerce.boolean().default(true),
  videoSource: z.enum(["UPLOAD", "EMBED"]).optional(),
  videoEmbedUrl: z.string().optional(),
  videoFileId: z.string().optional(),
  videoDurationSeconds: z.coerce.number().int().optional(),
  pdfFileId: z.string().optional(),
  textContent: z.string().optional(),
  provaId: z.string().optional(),
});

/**
 * Aula de prova sem prova escolhida não avalia nada, e a pessoa que a abrisse
 * veria uma tela vazia sem entender por quê. A recusa é aqui, na gravação,
 * porque depois o defeito só aparece para quem está estudando.
 */
function motivoDeAulaInvalida(dados: { type: string; provaId?: string }) {
  if (dados.type === "PROVA" && !dados.provaId) {
    return "Escolha qual prova esta aula vai aplicar.";
  }
  return null;
}

export async function createLesson(moduleId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeModulo(moduleId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = lessonSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    required: boolFromForm(formData, "required"),
    videoSource: formData.get("videoSource") || undefined,
    videoEmbedUrl: formData.get("videoEmbedUrl") || undefined,
    videoFileId: formData.get("videoFileId") || undefined,
    videoDurationSeconds: formData.get("videoDurationSeconds") || undefined,
    pdfFileId: formData.get("pdfFileId") || undefined,
    textContent: formData.get("textContent") || undefined,
    provaId: formData.get("provaId") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const invalida = motivoDeAulaInvalida(parsed.data);
  if (invalida) return { ok: false, error: invalida };

  const count = await db.lesson.count({ where: { moduleId } });
  const mod = await db.module.findUnique({ where: { id: moduleId } });
  if (!mod) return { ok: false, error: "Módulo não encontrado." };

  await db.lesson.create({
    data: {
      moduleId,
      order: count,
      title: parsed.data.title,
      type: parsed.data.type,
      required: parsed.data.required,
      videoSource: parsed.data.videoSource,
      videoEmbedUrl: parsed.data.videoEmbedUrl || null,
      videoFileId: parsed.data.videoFileId || null,
      videoDurationSeconds: parsed.data.videoDurationSeconds,
      pdfFileId: parsed.data.pdfFileId || null,
      textContent: parsed.data.textContent || null,
      provaId: parsed.data.provaId || null,
    },
  });

  await ressincronizarProgressoDoCurso(mod.courseId);
  revalidatePath(`/admin/cursos/${mod.courseId}`);
  return { ok: true };
}

export async function updateLesson(lessonId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeAula(lessonId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = lessonSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    required: boolFromForm(formData, "required"),
    videoSource: formData.get("videoSource") || undefined,
    videoEmbedUrl: formData.get("videoEmbedUrl") || undefined,
    videoFileId: formData.get("videoFileId") || undefined,
    videoDurationSeconds: formData.get("videoDurationSeconds") || undefined,
    pdfFileId: formData.get("pdfFileId") || undefined,
    textContent: formData.get("textContent") || undefined,
    provaId: formData.get("provaId") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const invalida = motivoDeAulaInvalida(parsed.data);
  if (invalida) return { ok: false, error: invalida };

  const lesson = await db.lesson.update({
    where: { id: lessonId },
    data: {
      title: parsed.data.title,
      type: parsed.data.type,
      required: parsed.data.required,
      videoSource: parsed.data.videoSource,
      videoEmbedUrl: parsed.data.videoEmbedUrl || null,
      ...(parsed.data.videoFileId ? { videoFileId: parsed.data.videoFileId } : {}),
      videoDurationSeconds: parsed.data.videoDurationSeconds,
      ...(parsed.data.pdfFileId ? { pdfFileId: parsed.data.pdfFileId } : {}),
      textContent: parsed.data.textContent || null,
      provaId: parsed.data.provaId || null,
    },
    include: { module: true },
  });

  await ressincronizarProgressoDoCurso(lesson.module.courseId);
  revalidatePath(`/admin/cursos/${lesson.module.courseId}`);
  return { ok: true };
}

export async function deleteLesson(lessonId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeAula(lessonId, admin.id);
  if (bloqueio) return bloqueio;

  const lesson = await db.lesson.delete({ where: { id: lessonId }, include: { module: true } });
  await ressincronizarProgressoDoCurso(lesson.module.courseId);
  revalidatePath(`/admin/cursos/${lesson.module.courseId}`);
  return { ok: true };
}

export async function reorderLessons(moduleId: string, orderedIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeModulo(moduleId, admin.id);
  if (bloqueio) return bloqueio;

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.lesson.update({ where: { id }, data: { order: index } })
    )
  );
  const mod = await db.module.findUnique({ where: { id: moduleId } });
  if (mod) revalidatePath(`/admin/cursos/${mod.courseId}`);
  return { ok: true };
}
