"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markLessonComplete } from "@/lib/actions/learning";

export function MarkCompleteButton({
  lessonId,
  completed,
}: {
  lessonId: string;
  completed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (completed) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl bg-success-100 px-4 py-2.5 text-sm font-medium text-success-600">
        <CheckCircle2 className="h-4 w-4" />
        Aula concluída
      </div>
    );
  }

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markLessonComplete(lessonId);
          router.refresh();
        })
      }
    >
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Salvando..." : "Marcar como concluído"}
    </Button>
  );
}
