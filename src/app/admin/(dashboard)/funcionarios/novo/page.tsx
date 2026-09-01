import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { carregarAtorOuFalhar } from "@/lib/alcance-admin";
import { requireAdmin } from "@/lib/session";
import { Alert } from "@/components/ui/alert";
import { EmployeeForm } from "@/components/admin/employee-form";
import { departamentosPermitidos } from "@/lib/permissoes-usuario";

export default async function NovoFuncionarioPage() {
  const admin = await requireAdmin();
  const ator = await carregarAtorOuFalhar(admin.id);

  // Um administrador comum só cadastra dentro do próprio departamento. Oferecer
  // os demais na lista seria oferecer um cadastro que o servidor vai recusar.
  const departments = departamentosPermitidos(
    ator,
    await db.department.findMany({ orderBy: { name: "asc" } })
  );

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/funcionarios" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-700">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Novo funcionário</h1>
        <p className="text-sm text-ink-700/70">
          Uma senha temporária será gerada automaticamente e exibida após o cadastro.
        </p>
      </div>

      {departments.length === 0 ? (
        <Alert tone="info">
          Sua conta ainda não tem departamento definido, então não há onde cadastrar
          um usuário. Peça ao proprietário da plataforma para definir o seu departamento.
        </Alert>
      ) : (
        <div className="rounded-2xl border border-border bg-white p-6">
          <EmployeeForm departments={departments} />
        </div>
      )}
    </div>
  );
}
