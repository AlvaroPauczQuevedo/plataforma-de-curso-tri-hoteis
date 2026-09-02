import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getEnrollmentsWithProgress } from "@/lib/portal-data";
import { CourseCard } from "@/components/portal/course-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CoursesTabs } from "@/components/portal/courses-tabs";

export default async function MeusCursosPage(
  props: {
    searchParams: Promise<{ aba?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const items = await getEnrollmentsWithProgress(user.id);

  const aba = searchParams.aba ?? "todos";

  const disponiveis = items;
  const andamento = items.filter((i) => i.percent > 0 && !i.completed);
  const concluidos = items.filter((i) => i.completed);

  const filtered =
    aba === "andamento" ? andamento : aba === "concluidos" ? concluidos : disponiveis;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Meus cursos</h1>
        <p className="text-sm text-ink-700/70">
          Todos os cursos liberados para você, organizados por status.
        </p>
      </div>

      <CoursesTabs
        current={aba}
        counts={{ todos: disponiveis.length, andamento: andamento.length, concluidos: concluidos.length }}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum curso encontrado"
          description={
            aba === "todos"
              ? "Ainda não há cursos liberados para o seu usuário. Fale com o administrador da plataforma."
              : "Não há cursos nesta categoria no momento."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <CourseCard
              key={item.course.id}
              id={item.course.id}
              title={item.course.title}
              description={item.course.description}
              coverUrl={item.course.coverFile ? `/api/files/${item.course.coverFile.id}` : null}
              categoryName={item.course.category?.name}
              difficulty={item.course.difficulty}
              durationMinutes={item.course.durationMinutes}
              percent={item.percent}
              mandatory={item.enrollment.mandatory}
              dueDate={item.enrollment.dueDate}
              overdue={item.overdue}
              completed={item.completed}
            />
          ))}
        </div>
      )}
    </div>
  );
}
