"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function ActionForm({
  action,
  onSuccess,
  children,
  submitLabel = "Salvar",
  className,
  resetOnSuccess = false,
  submitVariant = "primary",
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  onSuccess?: (result: Extract<ActionResult, { ok: true }>) => void;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitVariant?: "primary" | "secondary" | "danger" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(formData);
      setResult(res);
      if (res.ok) {
        if (resetOnSuccess) formRef.current?.reset();
        router.refresh();
        onSuccess?.(res);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {children}
      {result && !result.ok && <Alert tone="danger">{result.error}</Alert>}
      {result && result.ok && result.message && <Alert tone="success">{result.message}</Alert>}
      <Button type="submit" disabled={pending} variant={submitVariant}>
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
