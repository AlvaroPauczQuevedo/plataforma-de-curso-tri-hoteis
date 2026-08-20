"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function QuickAddForm({
  action,
  placeholder,
}: {
  action: (name: string) => Promise<ActionResult>;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    startTransition(async () => {
      const res = await action(value.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setValue("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-border px-3.5 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-xl bg-accent-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </form>
  );
}
