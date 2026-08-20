import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CheckCircle2, FileText, Video, BookOpen } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { userHasCourseAccess, isLessonUnlocked } from "@/lib/access";
import { VideoPlayer } from "@/components/portal/video-player";
import { PdfViewer } from "@/components/portal/pdf-viewer";
import { MarkCompleteButton } from "@/components/portal/mark-complete-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const lessonIcon = { VIDEO: Video, PDF: FileText, TEXT: BookOpen };

export default async function LessonPlayerPage({
  params,
}: {
  params: { courseId: string; lessonId: string };
}) {
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
    include: { videoFile: true, pdfFile: true },
  });

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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-accent-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar ao curso
        </Link>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-navy-900">{course.title}</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {course.modules.map((module, idx) => (
              <div key={module.id}>
                <p className="bg-surface-muted/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-navy-700/60">
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
                              ? "bg-accent-600/10 text-accent-600 font-medium"
                              : "text-navy-700 hover:bg-surface-muted"
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
          <h1 className="text-xl font-semibold text-navy-900 sm:text-2xl">{lesson.title}</h1>
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

        {lesson.type === "TEXT" && (
          <div className="space-y-4">
            <div className="whitespace-pre-line rounded-2xl border border-border bg-white p-6 text-navy-800 leading-relaxed">
              {lesson.textContent}
            </div>
            <MarkCompleteButton lessonId={lesson.id} completed={Boolean(currentProgress?.completed)} />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-5">
          {prevLesson ? (
            <Link
              href={`/cursos/${courseId}/aulas/${prevLesson.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-accent-600"
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-accent-600"
            >
              Próxima aula
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href={`/cursos/${courseId}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:underline"
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
