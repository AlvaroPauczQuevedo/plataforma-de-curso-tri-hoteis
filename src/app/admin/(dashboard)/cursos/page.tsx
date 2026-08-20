import { Suspense } from "react";
import Link from "next/link";
import { Plus, BookOpen, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput, SelectFilter } from "@/components/admin/table-filters";
import { statusLabel, difficultyLabel, formatDuration } from "@/lib/utils";

export default async function CursosPage({
  searchParams,
}: {
  searchParams: { q?: string; categoria?: string; status?: string };
}) {
  await requireAdmin();

  const where = {
    ...(searchParams.q ? { title: { contains: searchParams.q } } : {}),
    ...(searchParams.categoria ? { categoryId: searchParams.categoria } : {}),
    ...(searchParams.status ? { status: searchParams.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
  };

  const [courses, categories] = await Promise.all([
    db.course.findMany({
      where,
      include: { category: true, coverFile: true, _count: { select: { enrollments: true, modules: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const statusTone = { DRAFT: "warning", PUBLISHED: "success", ARCHIVED: "neutral" } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Cursos</h1>
          <p className="text-sm text-navy-700/70">{courses.length} curso(s) cadastrado(s)</p>
        </div>
        <ButtonLink href="/admin/cursos/novo">
          <Plus className="h-4 w-4" />
          Novo curso
        </ButtonLink>
      </div>

      <Suspense>
        <div className="flex flex-wrap gap-3">
          <SearchInput placeholder="Buscar por título..." />
          <SelectFilter
            paramKey="categoria"
            placeholder="Todas as categorias"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectFilter
            paramKey="status"
            placeholder="Todos os status"
            options={[
              { value: "DRAFT", label: "Rascunho" },
              { value: "PUBLISHED", label: "Publicado" },
              { value: "ARCHIVED", label: "Arquivado" },
            ]}
          />
        </div>
      </Suspense>

      {courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nenhum curso encontrado" description="Ajuste os filtros ou crie um novo curso." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/admin/cursos/${course.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative h-28 bg-gradient-to-br from-navy-900 to-accent-600">
                {course.coverFile && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${course.coverFile.id}`}
                    alt={course.title}
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute left-2.5 top-2.5">
                  <Badge tone={statusTone[course.status]}>{statusLabel(course.status)}</Badge>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                {course.category && (
                  <p className="text-xs font-medium uppercase tracking-wide text-accent-600">
                    {course.category.name}
                  </p>
                )}
                <h3 className="line-clamp-2 text-sm font-semibold text-navy-900">{course.title}</h3>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2 text-xs text-navy-700/60">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {formatDuration(course.durationMinutes)}
                  </span>
                  <span>{difficultyLabel(course.difficulty)}</span>
                  <span>{course._count.modules} módulo(s)</span>
                  <span>{course._count.enrollments} matrícula(s)</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
