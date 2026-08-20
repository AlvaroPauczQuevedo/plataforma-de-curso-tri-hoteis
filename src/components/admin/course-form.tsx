"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/shared/action-form";
import { FileUploadField } from "@/components/admin/file-upload-field";
import { createCourse, updateCourse } from "@/lib/actions/courses";
import type { Category, Course } from "@prisma/client";

export function CourseForm({
  categories,
  course,
}: {
  categories: Category[];
  course?: Course & { coverFile?: { originalName: string } | null };
}) {
  const router = useRouter();
  const isEdit = Boolean(course);

  return (
    <ActionForm
      submitLabel={isEdit ? "Salvar alterações" : "Criar curso"}
      action={async (formData) => {
        if (isEdit) return updateCourse(course!.id, formData);
        const result = await createCourse(formData);
        if (result.ok && result.courseId) {
          router.push(`/admin/cursos/${result.courseId}`);
        }
        return result;
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-ink-900">
          Título do curso
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={course?.title}
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium text-ink-900">
          Descrição
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          defaultValue={course?.description}
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="categoryId" className="text-sm font-medium text-ink-900">
            Categoria
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={course?.categoryId ?? ""}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="instructor" className="text-sm font-medium text-ink-900">
            Instrutor(a)
          </label>
          <input
            id="instructor"
            name="instructor"
            defaultValue={course?.instructor ?? ""}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="durationMinutes" className="text-sm font-medium text-ink-900">
            Carga horária (min)
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            defaultValue={course?.durationMinutes ?? 0}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="difficulty" className="text-sm font-medium text-ink-900">
            Nível de dificuldade
          </label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={course?.difficulty ?? "INICIANTE"}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="INICIANTE">Iniciante</option>
            <option value="INTERMEDIARIO">Intermediário</option>
            <option value="AVANCADO">Avançado</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="videoCompletionThreshold" className="text-sm font-medium text-ink-900">
            % vídeo p/ concluir
          </label>
          <input
            id="videoCompletionThreshold"
            name="videoCompletionThreshold"
            type="number"
            min={50}
            max={100}
            defaultValue={course?.videoCompletionThreshold ?? 90}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
      </div>

      <FileUploadField
        kind="covers"
        name="coverFileId"
        initialFileId={course?.coverFileId}
        initialFileName={course?.coverFile?.originalName}
        label="Imagem de capa"
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-surface-muted p-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="sequential"
            defaultChecked={course?.sequential ?? false}
            className="h-4 w-4 rounded border-border"
          />
          Aulas em ordem obrigatória
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="allowDownload"
            defaultChecked={course?.allowDownload ?? true}
            className="h-4 w-4 rounded border-border"
          />
          Permitir baixar materiais
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="certificateEnabled"
            defaultChecked={course?.certificateEnabled ?? true}
            className="h-4 w-4 rounded border-border"
          />
          Certificado habilitado
        </label>
      </div>
    </ActionForm>
  );
}
