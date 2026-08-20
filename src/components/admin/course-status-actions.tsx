"use client";

import { useRouter } from "next/navigation";
import { Eye, Copy, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { Alert } from "@/components/ui/alert";
import { useState } from "react";
import { setCourseStatus, duplicateCourse, deleteCourse } from "@/lib/actions/courses";
import type { CourseStatus } from "@prisma/client";

export function CourseStatusActions({ courseId, status }: { courseId: string; status: CourseStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "PUBLISHED" && (
          <ActionButton
            action={async () => {
              const res = await setCourseStatus(courseId, "PUBLISHED");
              if (!res.ok) setError(res.error);
              return res;
            }}
            variant="primary"
          >
            Publicar curso
          </ActionButton>
        )}
        {status === "PUBLISHED" && (
          <ActionButton action={() => setCourseStatus(courseId, "DRAFT")} variant="outline">
            Mover para rascunho
          </ActionButton>
        )}
        {status !== "ARCHIVED" && (
          <ActionButton
            action={() => setCourseStatus(courseId, "ARCHIVED")}
            variant="outline"
            confirmMessage="Arquivar este curso? Ele deixará de aparecer para novos funcionários."
          >
            Arquivar
          </ActionButton>
        )}
        {status === "ARCHIVED" && (
          <ActionButton action={() => setCourseStatus(courseId, "DRAFT")} variant="outline">
            Restaurar para rascunho
          </ActionButton>
        )}

        <a
          href={`/cursos/${courseId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          <Eye className="h-4 w-4" />
          Visualizar como funcionário
        </a>

        <ActionButton
          action={async () => {
            const res = await duplicateCourse(courseId);
            if (res.ok && res.courseId) router.push(`/admin/cursos/${res.courseId}`);
            return res;
          }}
          variant="outline"
        >
          <Copy className="h-4 w-4" />
          Duplicar
        </ActionButton>

        <ActionButton
          action={async () => {
            const res = await deleteCourse(courseId);
            if (res.ok) router.push("/admin/cursos");
            return res;
          }}
          variant="danger"
          confirmMessage="Excluir este curso permanentemente? Esta ação não pode ser desfeita."
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </ActionButton>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
