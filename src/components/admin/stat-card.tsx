import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "accent",
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "accent" | "success" | "warning" | "danger" | "navy";
  hint?: string;
}) {
  const toneClasses = {
    accent: "bg-accent-600/10 text-accent-600",
    success: "bg-success-100 text-success-600",
    warning: "bg-warning-100 text-warning-600",
    danger: "bg-danger-100 text-danger-600",
    navy: "bg-navy-900/10 text-navy-900",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy-700/70">{label}</p>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", toneClasses)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-navy-700/50">{hint}</p>}
    </div>
  );
}
