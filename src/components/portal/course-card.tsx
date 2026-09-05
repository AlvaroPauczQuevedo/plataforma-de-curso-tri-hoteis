import Link from "next/link";
import { BookOpen, Clock, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { difficultyLabel, formatDuration, formatPrazo } from "@/lib/utils";

export function CourseCard({
  id,
  title,
  description,
  coverUrl,
  categoryName,
  difficulty,
  durationMinutes,
  percent,
  mandatory,
  dueDate,
  overdue,
  completed,
}: {
  id: string;
  title: string;
  description: string;
  coverUrl?: string | null;
  categoryName?: string | null;
  difficulty: string;
  durationMinutes: number;
  percent?: number;
  mandatory?: boolean;
  dueDate?: Date | string | null;
  overdue?: boolean;
  completed?: boolean;
}) {
  return (
    <Link
      href={`/cursos/${id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-ink-900 to-brand-700">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GraduationCap className="h-10 w-10 text-white/70" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {mandatory && <Badge tone="navy">Obrigatório</Badge>}
          {completed && <Badge tone="success">Concluído</Badge>}
          {overdue && !completed && <Badge tone="danger">Atrasado</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          {categoryName && (
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
              {categoryName}
            </p>
          )}
          <h3 className="line-clamp-2 font-semibold text-ink-900">{title}</h3>
          <p className="line-clamp-2 text-sm text-ink-700/70">{description}</p>
        </div>

        <div className="mt-auto flex items-center gap-3 text-xs text-ink-700/60">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {formatDuration(durationMinutes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> {difficultyLabel(difficulty)}
          </span>
        </div>

        {typeof percent === "number" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink-900">{percent}% concluído</span>
              {dueDate && (
                <span className={overdue ? "text-danger-600" : "text-ink-700/60"}>
                  Prazo: {formatPrazo(dueDate)}
                </span>
              )}
            </div>
            <ProgressBar percent={percent} size="sm" />
          </div>
        )}
      </div>
    </Link>
  );
}
