import Link from "next/link";
import { PlayCircle, Award, AlarmClock, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getEmployeeDashboard } from "@/lib/portal-data";
import { CourseCard } from "@/components/portal/course-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function PortalHomePage() {
  const user = await requireUser();
  const {
    inProgress,
    upcomingDeadlines,
    recentlyCompleted,
    overallPercent,
    continueItem,
    continueLessonId,
    items,
  } = await getEmployeeDashboard(user.id);

  const firstName = (user.name ?? "").split(" ")[0];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-accent-600 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-white/70">Bem-vindo(a) de volta,</p>
            <h1 className="text-2xl font-semibold sm:text-3xl">{firstName} 👋</h1>
            <p className="max-w-md text-sm text-white/70">
              {items.length === 0
                ? "Assim que um curso for liberado para você, ele aparecerá por aqui."
                : "Continue de onde parou e acompanhe seu progresso de aprendizagem."}
            </p>
          </div>

          {continueItem && (
            <ButtonLink
              href={
                continueLessonId
                  ? `/cursos/${continueItem.course.id}/aulas/${continueLessonId}`
                  : `/cursos/${continueItem.course.id}`
              }
              variant="primary"
              size="lg"
              className="bg-white text-navy-900 hover:bg-white/90"
            >
              <PlayCircle className="h-5 w-5" />
              Continuar estudando
            </ButtonLink>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-6 max-w-sm space-y-1.5 rounded-xl bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-white/80">
                <TrendingUp className="h-4 w-4" /> Progresso geral
              </span>
              <span className="font-semibold">{overallPercent}%</span>
            </div>
            <ProgressBar percent={overallPercent} tone="accent" />
          </div>
        )}
      </section>

      {upcomingDeadlines.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-900">
            <AlarmClock className="h-5 w-5 text-warning-600" />
            Cursos obrigatórios próximos do prazo
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingDeadlines.slice(0, 3).map((item) => (
              <CourseCard
                key={item.course.id}
                id={item.course.id}
                title={item.course.title}
                description={item.course.description}
                coverUrl={item.course.coverFile ? `/api/files/${item.course.coverFile.id}` : null}
                categoryName={item.course.category?.name}
                difficulty={item.course.difficulty}
                durationMinutes={item.course.durationMinutes}
                percent={item.percent}
                mandatory={item.enrollment.mandatory}
                dueDate={item.enrollment.dueDate}
                overdue={item.overdue}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-navy-900">Cursos em andamento</h2>
          {items.length > 0 && (
            <Link href="/meus-cursos" className="text-sm font-medium text-accent-600 hover:underline">
              Ver todos
            </Link>
          )}
        </div>

        {inProgress.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title="Nenhum curso em andamento"
            description="Assim que você começar um curso liberado, ele aparecerá aqui para você continuar de onde parou."
            action={
              items.length > 0 ? (
                <ButtonLink href="/meus-cursos" size="sm" variant="outline">
                  Ver meus cursos
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map((item) => (
              <CourseCard
                key={item.course.id}
                id={item.course.id}
                title={item.course.title}
                description={item.course.description}
                coverUrl={item.course.coverFile ? `/api/files/${item.course.coverFile.id}` : null}
                categoryName={item.course.category?.name}
                difficulty={item.course.difficulty}
                durationMinutes={item.course.durationMinutes}
                percent={item.percent}
                mandatory={item.enrollment.mandatory}
                dueDate={item.enrollment.dueDate}
                overdue={item.overdue}
              />
            ))}
          </div>
        )}
      </section>

      {recentlyCompleted.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-900">
            <Award className="h-5 w-5 text-success-600" />
            Concluídos recentemente
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyCompleted.slice(0, 3).map((item) => (
              <div
                key={item.course.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-100">
                  <Award className="h-5 w-5 text-success-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-900">{item.course.title}</p>
                  <p className="text-xs text-navy-700/60">
                    Concluído em {formatDate(item.completedAt)}
                  </p>
                </div>
                <Badge tone="success">100%</Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
