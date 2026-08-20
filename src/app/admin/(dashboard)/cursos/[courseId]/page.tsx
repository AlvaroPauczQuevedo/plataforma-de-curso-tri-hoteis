import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { CourseForm } from "@/components/admin/course-form";
import { CourseStatusActions } from "@/components/admin/course-status-actions";
import { ModuleLessonBuilder } from "@/components/admin/module-lesson-builder";
import { statusLabel } from "@/lib/utils";

export default async function CourseEditorPage({
  params,
}: {
  params: { courseId: string };
}) {
  await requireAdmin();
  const { courseId } = params;

  const [course, categories] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      include: {
        coverFile: true,
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: { order: "asc" },
              include: { videoFile: true, pdfFile: true },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!course) notFound();

  const statusTone = course.status === "PUBLISHED" ? "success" : course.status === "ARCHIVED" ? "neutral" : "warning";

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/cursos" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-accent-600">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-navy-900">{course.title}</h1>
            <Badge tone={statusTone}>{statusLabel(course.status)}</Badge>
          </div>
          <p className="text-sm text-navy-700/70">{course._count.enrollments} matrícula(s)</p>
        </div>
      </div>

      <CourseStatusActions courseId={course.id} status={course.status} />

      <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold text-navy-900">Informações básicas</h2>
        <CourseForm categories={categories} course={course} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-navy-900">Módulos e aulas</h2>
          <p className="text-sm text-navy-700/60">Arraste para reordenar módulos e aulas.</p>
        </div>
        <ModuleLessonBuilder courseId={course.id} modules={course.modules} />
      </section>
    </div>
  );
}
