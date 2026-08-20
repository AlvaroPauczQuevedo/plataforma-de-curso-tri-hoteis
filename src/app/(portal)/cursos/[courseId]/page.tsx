import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  FileText,
  Video,
  BookOpen,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { userHasCourseAccess, isLessonUnlocked } from "@/lib/access";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, formatDuration, difficultyLabel } from "@/lib/utils";
import { getNextLessonId } from "@/lib/portal-data";

const lessonIcon = { VIDEO: Video, PDF: FileText, TEXT: BookOpen };

export default async function CourseDetailPage({
  params,
}: {
  params: { courseId: string };
}) {
  const user = await requireUser();
  const { courseId } = params;

  const hasAccess = user.role === "ADMIN" || (await userHasCourseAccess(user.id, courseId));
  if (!hasAccess) {
    redirect("/meus-cursos");
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      category: true,
      coverFile: true,
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!course) notFound();

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  const courseProgress = await db.courseProgress.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const lessonProgress = await db.lessonProgress.findMany({
    where: { userId: user.id, lessonId: { in: allLessons.map((l) => l.id) } },
  });
  const progressByLesson = new Map(lessonProgress.map((p) => [p.lessonId, p]));

  const requiredLessons = allLessons.filter((l) => l.required);
  const completedRequired = requiredLessons.filter((l) => progressByLesson.get(l.id)?.completed);
  const percent = courseProgress?.percent ?? 0;
  const completed = percent >= 100;

  const certificate = completed
    ? await db.certificate.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } })
    : null;

  const nextLessonId = enrollment ? await getNextLessonId(user.id, courseId) : allLessons[0]?.id;

  const lockedMap = new Map<string, boolean>();
  if (course.sequential && enrollment) {
    for (const lesson of allLessons) {
      lockedMap.set(lesson.id, !(await isLessonUnlocked(user.id, lesson.id)));
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="relative h-44 bg-gradient-to-br from-navy-900 to-accent-600 sm:h-56">
          {course.coverFile && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${course.coverFile.id}`}
              alt={course.title}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            {course.category && <Badge tone="accent">{course.category.name}</Badge>}
            {enrollment?.mandatory && <Badge tone="navy">Obrigatório</Badge>}
            {completed && <Badge tone="success">Concluído</Badge>}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-navy-900">{course.title}</h1>
            <p className="mt-1 text-navy-700/70">{course.description}</p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-navy-700/60">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {formatDuration(course.durationMinutes)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" /> {difficultyLabel(course.difficulty)}
            </span>
            {course.instructor && <span>Instrutor(a): {course.instructor}</span>}
            {enrollment?.dueDate && (
              <span>Prazo: {formatDate(enrollment.dueDate)}</span>
            )}
          </div>

          {enrollment && (
            <div className="space-y-2 rounded-xl bg-surface-muted p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-navy-900">
                  {completedRequired.length} de {requiredLessons.length} aulas concluídas
                </span>
                <span className="font-semibold text-navy-900">{percent}%</span>
              </div>
              <ProgressBar percent={percent} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {enrollment && nextLessonId && !completed && (
              <ButtonLink href={`/cursos/${course.id}/aulas/${nextLessonId}`} size="lg">
                <PlayCircle className="h-5 w-5" />
                {percent > 0 ? "Continuar curso" : "Começar curso"}
              </ButtonLink>
            )}
            {completed && certificate && (
              <ButtonLink
                href={`/api/certificados/${certificate.id}/pdf`}
                variant="secondary"
                size="lg"
              >
                <Award className="h-5 w-5" />
                Baixar certificado
              </ButtonLink>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-navy-900">Conteúdo do curso</h2>
        {course.modules.map((module, moduleIdx) => (
          <div key={module.id} className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border bg-surface-muted/60 px-5 py-3">
              <p className="text-sm font-semibold text-navy-900">
                Módulo {moduleIdx + 1}: {module.title}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {module.lessons.map((lesson) => {
                const Icon = lessonIcon[lesson.type];
                const lessonProg = progressByLesson.get(lesson.id);
                const isDone = Boolean(lessonProg?.completed);
                const isLocked = lockedMap.get(lesson.id) ?? false;
                const clickable = Boolean(enrollment) && !isLocked;

                const content = (
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isDone
                          ? "bg-success-100 text-success-600"
                          : isLocked
                          ? "bg-surface-muted text-navy-700/40"
                          : "bg-accent-600/10 text-accent-600"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isLocked ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${
                          isLocked ? "text-navy-700/40" : "text-navy-900"
                        }`}
                      >
                        {lesson.title}
                      </p>
                      <p className="text-xs text-navy-700/50">
                        {lesson.type === "VIDEO"
                          ? "Videoaula"
                          : lesson.type === "PDF"
                          ? "Material em PDF"
                          : "Conteúdo em texto"}
                        {!lesson.required && " · Opcional"}
                      </p>
                    </div>
                    {isDone && <Badge tone="success">Concluída</Badge>}
                  </div>
                );

                return (
                  <li key={lesson.id}>
                    {clickable ? (
                      <Link href={`/cursos/${course.id}/aulas/${lesson.id}`} className="block hover:bg-surface-muted/50">
                        {content}
                      </Link>
                    ) : (
                      <div className="opacity-80">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
