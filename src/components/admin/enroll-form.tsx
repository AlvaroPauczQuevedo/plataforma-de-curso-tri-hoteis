"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/shared/action-form";
import { enrollUsers } from "@/lib/actions/enrollments";

export function EnrollSingleForm({
  userId,
  courses,
}: {
  userId: string;
  courses: { id: string; title: string }[];
}) {
  const router = useRouter();

  return (
    <ActionForm
      submitLabel="Matricular"
      action={(formData) =>
        enrollUsers({
          courseId: String(formData.get("courseId")),
          userIds: [userId],
          mandatory: formData.get("mandatory") === "on",
          dueDate: (formData.get("dueDate") as string) || undefined,
        })
      }
      onSuccess={() => router.refresh()}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-navy-900">Curso</label>
          <select
            name="courseId"
            required
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          >
            <option value="">Selecione um curso...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-navy-900">Prazo (opcional)</label>
          <input
            type="date"
            name="dueDate"
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
        </div>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" name="mandatory" className="h-4 w-4 rounded border-border" />
            Obrigatório
          </label>
        </div>
      </div>
    </ActionForm>
  );
}
