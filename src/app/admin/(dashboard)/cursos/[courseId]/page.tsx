import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { CourseForm } from "@/components/admin/course-form";
import { CourseStatusActions } from "@/components/admin/course-status-actions";
import { ModuleLessonBuilder } from "@/components/admin/module-lesson-builder";
import { Alert } from "@/components/ui/alert";
import { statusLabel } from "@/lib/utils";
import { motivoDeBloqueioDeCurso } from "@/lib/permissoes-usuario";

export default async function CourseEditorPage({
  params,
}: {
  params: { courseId: string };
}) {
  const admin = await requireAdmin();
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
        _count: { select: { enrollments: true, certificates: true } },
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!course) notFound();

  const ator = await db.user.findUniqueOrThrow({
    where: { id: admin.id },
    select: { id: true, protegido: true, departmentId: true },
  });
  const motivo = motivoDeBloqueioDeCurso(course, ator);

  // Só o proprietário escolhe o departamento de um curso. Para os demais o
  // curso já nasce no departamento deles e não há escolha a oferecer.
  const departamentos = ator.protegido
    ? await db.department.findMany({ orderBy: { name: "asc" } })
    : [];

  const statusTone = course.status === "PUBLISHED" ? "success" : course.status === "ARCHIVED" ? "neutral" : "warning";

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/cursos" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-700">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink-900">{course.title}</h1>
            <Badge tone={statusTone}>{statusLabel(course.status)}</Badge>
          </div>
          <p className="text-sm text-ink-700/70">{course._count.enrollments} matrícula(s)</p>
        </div>
      </div>

      {/*
        Fora do alcance, o curso vira consulta. Esconder os controles é melhor
        do que exibi-los e deixar o servidor recusar depois do clique.
      */}
      {motivo ? (
        <Alert tone="info">{motivo} Você continua vendo o curso e o conteúdo dele.</Alert>
      ) : (
        <CourseStatusActions
          courseId={course.id}
          status={course.status}
          matriculas={course._count.enrollments}
          certificados={course._count.certificates}
        />
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold text-ink-900">Informações básicas</h2>
        {motivo ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-700/60">Descrição</dt>
              <dd className="text-ink-900">{course.description}</dd>
            </div>
            <div>
              <dt className="text-ink-700/60">Instrutor(a)</dt>
              <dd className="text-ink-900">{course.instructor ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <CourseForm
            categories={categories}
            course={course}
            departamentos={departamentos}
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-ink-900">Módulos e aulas</h2>
          {!motivo && (
            <p className="text-sm text-ink-700/60">Arraste para reordenar módulos e aulas.</p>
          )}
        </div>
        {motivo ? (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
            {course.modules.map((m) => (
              <li key={m.id} className="px-6 py-4">
                <p className="font-medium text-ink-900">{m.title}</p>
                <p className="text-sm text-ink-700/60">{m.lessons.length} aula(s)</p>
              </li>
            ))}
          </ul>
        ) : (
          <ModuleLessonBuilder courseId={course.id} modules={course.modules} />
        )}
      </section>
    </div>
  );
}
