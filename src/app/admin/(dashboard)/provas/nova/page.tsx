import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { ehProprietario } from "@/lib/alcance-admin";
import { ProvaForm } from "@/components/admin/prova-form";

export default async function NovaProvaPage() {
  const admin = await requireAdmin();

  /*
    Só o proprietário escolhe o departamento. Para os demais a prova nasce no
    departamento deles e o campo nem aparece — a mesma regra do curso.
  */
  const proprietario = await ehProprietario(admin.id);
  const departamentos = proprietario
    ? await db.department.findMany({ orderBy: { name: "asc" } })
    : [];

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/admin/provas"
        className="inline-flex items-center gap-1 text-sm text-ink-700/70 hover:text-ink-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Nova prova</h1>
        <p className="text-sm text-ink-700/70">
          A prova nasce como rascunho. Depois de salvar, você adiciona as questões
          e publica.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6">
        <ProvaForm departamentos={departamentos} />
      </div>
    </div>
  );
}
