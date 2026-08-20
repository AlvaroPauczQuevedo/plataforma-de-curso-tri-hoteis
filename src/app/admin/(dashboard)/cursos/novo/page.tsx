import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { CourseForm } from "@/components/admin/course-form";

export default async function NovoCursoPage() {
  await requireAdmin();
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/cursos" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-accent-600">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Novo curso</h1>
        <p className="text-sm text-navy-700/70">
          O curso será criado como rascunho. Depois de salvar, você poderá adicionar módulos e aulas.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6">
        <CourseForm categories={categories} />
      </div>
    </div>
  );
}
