import { cn } from "@/lib/utils";

export function ProgressBar({
  percent,
  className,
  size = "md",
  tone,
}: {
  percent: number;
  className?: string;
  size?: "sm" | "md";
  tone?: "accent" | "success";
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const resolvedTone = tone ?? (clamped >= 100 ? "success" : "accent");

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-muted",
        size === "sm" ? "h-1.5" : "h-2.5",
        className
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          resolvedTone === "success"
            ? "bg-success-600"
            : "bg-gradient-to-r from-accent-600 to-electric-500"
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
