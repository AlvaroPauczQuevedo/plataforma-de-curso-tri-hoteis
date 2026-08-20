import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface-muted/50 px-6 py-14 text-center",
        className
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon className="h-6 w-6 text-navy-700/60" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium text-navy-900">{title}</p>
        {description && <p className="text-sm text-navy-700/70">{description}</p>}
      </div>
      {action}
    </div>
  );
}
