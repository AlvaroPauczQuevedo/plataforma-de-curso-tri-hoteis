"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  confirmMessage,
  className,
  onSuccess,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  confirmMessage?: string;
  className?: string;
  onSuccess?: (result: Extract<ActionResult, { ok: true }>) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onSuccess?.(res);
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={handleClick} className={className}>
        {pending ? "Aguarde..." : children}
      </Button>
      {error && <span className="text-xs text-danger-600">{error}</span>}
    </div>
  );
}
