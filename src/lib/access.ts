import { db } from "@/lib/db";
import { mapaDeLiberacao } from "@/lib/liberacao-de-aulas";

export async function userHasCourseAccess(userId: string, courseId: string) {
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  return Boolean(enrollment);
}

/**
 * Uma aula está liberada para esta pessoa?
 *
 * Guarda de servidor, para uma aula só: a tela do curso resolve o curso
 * inteiro de uma vez com `mapaDeLiberacao`. As duas chamam a MESMA função de
 * regra de propósito — se cada uma tivesse a sua, um dia discordariam, e o
 * jeito que isso apareceria é o pior possível: a lista mostrando a aula
 * aberta e o servidor recusando a entrada.
 */
export async function isLessonUnlocked(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return false;

  const course = lesson.module.course;
  if (!course.sequential) return true;

  const modules = await db.module.findMany({
    where: { courseId: course.id },
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  const aulasEmOrdem = modules.flatMap((m) => m.lessons);

  const concluidas = await db.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: aulasEmOrdem.map((l) => l.id) },
      completed: true,
    },
    select: { lessonId: true },
  });

  const liberadas = mapaDeLiberacao(
    aulasEmOrdem,
    new Set(concluidas.map((p) => p.lessonId)),
    true
  );

  return liberadas.get(lessonId) ?? false;
}

export async function fileBelongsToAccessibleCourse(userId: string, fileId: string, isAdmin: boolean) {
  if (isAdmin) return true;

  /*
    As três perguntas são independentes — o arquivo é vídeo de aula, PDF de
    aula ou capa de curso — e eram feitas em fila. Esta função roda em CADA
    requisição de /api/files, inclusive em cada Range request do player de
    vídeo: eram três idas ao banco, uma esperando a outra, para responder uma
    pergunta só. Juntas, custam a mais lenta das três.

    Os selects também encolheram: o que se quer de cada resultado é o id do
    curso, não a linha inteira da aula, do módulo e do curso.
  */
  const [lessonWithVideo, lessonWithPdf, courseWithCover] = await Promise.all([
    db.lesson.findFirst({
      where: { videoFileId: fileId },
      select: { module: { select: { courseId: true } } },
    }),
    db.lesson.findFirst({
      where: { pdfFileId: fileId },
      select: { module: { select: { courseId: true } } },
    }),
    db.course.findFirst({
      where: { coverFileId: fileId },
      select: { id: true, status: true },
    }),
  ]);

  const lesson = lessonWithVideo ?? lessonWithPdf;
  if (lesson) {
    return userHasCourseAccess(userId, lesson.module.courseId);
  }

  if (courseWithCover) {
    // Capas aparecem no catálogo, mas só de cursos publicados: a capa de um
    // rascunho revelaria um curso que ainda não foi liberado.
    if (courseWithCover.status === "PUBLISHED") return true;
    return userHasCourseAccess(userId, courseWithCover.id);
  }

  const file = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: { kind: true },
  });
  if (file?.kind === "AVATAR") return true;

  return false;
}
