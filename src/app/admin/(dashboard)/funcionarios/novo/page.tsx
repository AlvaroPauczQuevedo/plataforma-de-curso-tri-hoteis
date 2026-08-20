import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { EmployeeForm } from "@/components/admin/employee-form";

export default async function NovoFuncionarioPage() {
  await requireAdmin();
  const departments = await db.department.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/funcionarios" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-accent-600">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Novo funcionário</h1>
        <p className="text-sm text-navy-700/70">
          Uma senha temporária será gerada automaticamente e exibida após o cadastro.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6">
        <EmployeeForm departments={departments} />
      </div>
    </div>
  );
}
