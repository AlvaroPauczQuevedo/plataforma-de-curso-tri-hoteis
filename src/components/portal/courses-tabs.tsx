import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "todos", label: "Disponíveis" },
  { key: "andamento", label: "Em andamento" },
  { key: "concluidos", label: "Concluídos" },
];

export function CoursesTabs({
  current,
  counts,
}: {
  current: string;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 border border-border w-fit">
      {tabs.map((tab) => {
        const active = current === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.key === "todos" ? "/meus-cursos" : `/meus-cursos?aba=${tab.key}`}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-accent-600 text-white" : "text-navy-700 hover:bg-surface-muted"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                active ? "bg-white/20" : "bg-surface-muted"
              )}
            >
              {counts[tab.key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
