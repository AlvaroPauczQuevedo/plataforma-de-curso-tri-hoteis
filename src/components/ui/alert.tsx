import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info";

const config: Record<Tone, { classes: string; icon: typeof Info }> = {
  success: { classes: "bg-success-100 text-success-600 border-success-600/20", icon: CheckCircle2 },
  warning: { classes: "bg-warning-100 text-warning-600 border-warning-600/20", icon: AlertTriangle },
  danger: { classes: "bg-danger-100 text-danger-600 border-danger-600/20", icon: XCircle },
  info: { classes: "bg-brand-700/10 text-brand-700 border-brand-700/20", icon: Info },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { classes, icon: Icon } = config[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm animate-fade-in",
        classes,
        className
      )}
      role="alert"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
