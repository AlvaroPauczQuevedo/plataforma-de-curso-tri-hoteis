import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CheckCircle2, FileText, Video, BookOpen, FileQuestion,
  Download,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { ProvaRunner } from "@/components/portal/prova-runner";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/lib/db";
import { userHasCourseAccess, isLessonUnlocked } from "@/lib/access";
import { VideoPlayer } from "@/components/portal/video-player";
import { PdfViewer } from "@/components/portal/pdf-viewer";
import { MarkCompleteButton } from "@/components/portal/mark-complete-button";
import { cn } from "@/lib/utils";

const lessonIcon = { VIDEO: Video, PDF: FileText, TEXT: BookOpen, PROVA: FileQuestion };

export default async function LessonPlayerPage(
  props: {
    params: Promise<{ courseId: string; lessonId: string }>;
  }
) {
  const params = await props.params;
  const user = await requireUser();
  const { courseId, lessonId } = params;

  const hasAccess = user.role === "ADMIN" || (await userHasCourseAccess(user.id, courseId));
  if (!hasAccess) redirect("/meus-cursos");

  const unlocked = user.role === "ADMIN" || (await isLessonUnlocked(user.id, lessonId));
  if (!unlocked) redirect(`/cursos/${courseId}`);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) notFound();

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const lesson = allLessons.find((l) => l.id === lessonId);
  if (!lesson) notFound();

  const lessonWithRelations = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      videoFile: true,
      pdfFile: true,
      /*
        As alternativas vêm SEM o campo `correta`: o gabarito não pode
        trafegar até o navegador antes da entrega.
      */
      prova: {
        include: {
          questoes: {
            select: {
              id: true,
              enunciado: true,
              alternativas: {
                select: { id: true, texto: true },
                orderBy: { ordem: "asc" as const },
              },
            },
            orderBy: { ordem: "asc" as const },
          },
        },
      },
    },
  });

  const tentativasDaProva = lessonWithRelations?.prova
    ? await db.tentativaProva.findMany({
        where: { userId: user.id, provaId: lessonWithRelations.prova.id },
        orderBy: { createdAt: "desc" },
        take: 3,
      })
    : [];

  const progressRecords = await db.lessonProgress.findMany({
    where: { userId: user.id, lessonId: { in: allLessons.map((l) => l.id) } },
  });
  const progressByLesson = new Map(progressRecords.map((p) => [p.lessonId, p]));
  const currentProgress = progressByLesson.get(lessonId);

  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="order-2 space-y-4 lg:order-1">
        <Link
          href={`/cursos/${courseId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar ao curso
        </Link>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">{course.title}</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {course.modules.map((module, idx) => (
              <div key={module.id}>
                <p className="bg-surface-muted/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-700/60">
                  Módulo {idx + 1}: {module.title}
                </p>
                <ul>
                  {module.lessons.map((l) => {
                    const Icon = lessonIcon[l.type];
                    const done = Boolean(progressByLesson.get(l.id)?.completed);
                    const active = l.id === lessonId;
                    return (
                      <li key={l.id}>
                        <Link
                          href={`/cursos/${courseId}/aulas/${l.id}`}
                          className={cn(
                            "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
                            active
                              ? "bg-brand-700/10 text-brand-700 font-medium"
                              : "text-ink-700 hover:bg-surface-muted"
                          )}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
                          ) : (
                            <Icon className="h-4 w-4 shrink-0 opacity-60" />
                          )}
                          <span className="truncate">{l.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="order-1 space-y-5 lg:order-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={lesson.required ? "navy" : "neutral"}>
              {lesson.required ? "Obrigatória" : "Opcional"}
            </Badge>
            {currentProgress?.completed && <Badge tone="success">Concluída</Badge>}
          </div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">{lesson.title}</h1>
        </div>

        {lesson.type === "VIDEO" && lesson.videoSource === "UPLOAD" && lessonWithRelations?.videoFile && (
          <VideoPlayer
            lessonId={lesson.id}
            src={`/api/files/${lessonWithRelations.videoFile.id}`}
            thresholdPercent={course.videoCompletionThreshold}
            initialPositionSeconds={currentProgress?.videoPositionSeconds ?? 0}
            initialCompleted={Boolean(currentProgress?.completed)}
          />
        )}

        {lesson.type === "VIDEO" && lesson.videoSource === "EMBED" && lesson.videoEmbedUrl && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl bg-black">
              <iframe
                src={lesson.videoEmbedUrl}
                title={lesson.title}
                className="aspect-video w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <MarkCompleteButton lessonId={lesson.id} completed={Boolean(currentProgress?.completed)} />
          </div>
        )}

        {lesson.type === "PDF" && lessonWithRelations?.pdfFile && (
          <div className="space-y-4">
            <PdfViewer src={`/api/files/${lessonWithRelations.pdfFile.id}`} allowDownload={course.allowDownload} />
            <MarkCompleteButton lessonId={lesson.id} completed={Boolean(currentProgress?.completed)} />
          </div>
        )}

        {lesson.type === "PROVA" && (
          <div className="space-y-4">
            {!lessonWithRelations?.prova ? (
              <div className="rounded-2xl border border-warning-600/30 bg-warning-100/50 p-5 text-sm text-ink-800">
                Esta aula ainda não tem prova associada. Fale com quem administra
                o treinamento.
              </div>
            ) : !lessonWithRelations.prova.publicada ? (
              /*
                Prova em rascunho não aceita entrega. Sem este aviso a pessoa
                responderia tudo para só então descobrir que não conta.
              */
              <div className="rounded-2xl border border-warning-600/30 bg-warning-100/50 p-5 text-sm text-ink-800">
                A prova desta aula ainda está em rascunho e não pode ser
                respondida. Fale com quem administra o treinamento.
              </div>
            ) : (
              <>
                {currentProgress?.completed && (
                  <div className="rounded-2xl border border-success-600/30 bg-success-100/50 p-5 text-sm text-ink-800">
                    Você já foi aprovado nesta prova. Pode refazê-la para revisar —
                    a conclusão da aula não se perde.
                  </div>
                )}

                {tentativasDaProva.length > 0 && (
                  <div className="rounded-2xl border border-border bg-white p-5">
                    <h2 className="mb-3 font-semibold text-ink-900">
                      {tentativasDaProva.length === 1
                        ? "Sua tentativa anterior"
                        : `Suas últimas ${tentativasDaProva.length} tentativas`}
                    </h2>
                    <ul className="divide-y divide-border">
                      {tentativasDaProva.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                          <span className="flex-1 text-sm text-ink-700/70">
                            {formatDateTime(t.createdAt)}
                          </span>
                          <span className="text-sm text-ink-700/60">
                            {t.acertos}/{t.total}
                          </span>
                          <span className="text-sm font-semibold text-ink-900">
                            {t.nota}%
                          </span>
                          <Badge tone={t.aprovado ? "success" : "danger"}>
                            {t.aprovado ? "Aprovado" : "Reprovado"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <a
                  href={`/api/provas/${lessonWithRelations.prova.id}/pdf`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-surface-muted"
                >
                  <Download className="h-4 w-4" />
                  Baixar a prova em PDF
                </a>

                <ProvaRunner
                  provaId={lessonWithRelations.prova.id}
                  notaMinima={lessonWithRelations.prova.notaMinima}
                  questoes={lessonWithRelations.prova.questoes}
                />
              </>
            )}
          </div>
        )}

        {lesson.type === "TEXT" && (
          <div className="space-y-4">
            <div className="whitespace-pre-line rounded-2xl border border-border bg-white p-6 text-ink-800 leading-relaxed">
              {lesson.textContent}
            </div>
            <MarkCompleteButton lessonId={lesson.id} completed={Boolean(currentProgress?.completed)} />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-5">
          {prevLesson ? (
            <Link
              href={`/cursos/${courseId}/aulas/${prevLesson.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Aula anterior
            </Link>
          ) : (
            <span />
          )}
          {nextLesson ? (
            <Link
              href={`/cursos/${courseId}/aulas/${nextLesson.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-700"
            >
              Próxima aula
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href={`/cursos/${courseId}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              Ver resumo do curso
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
