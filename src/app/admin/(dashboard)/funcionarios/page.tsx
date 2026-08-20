import { Suspense } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput, SelectFilter, Pagination } from "@/components/admin/table-filters";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 10;

export default async function FuncionariosPage({
  searchParams,
}: {
  searchParams: { q?: string; departamento?: string; status?: string; page?: string };
}) {
  await requireAdmin();

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const where = {
    role: "EMPLOYEE" as const,
    ...(searchParams.q
      ? {
          OR: [
            { name: { contains: searchParams.q } },
            { email: { contains: searchParams.q } },
            { position: { contains: searchParams.q } },
          ],
        }
      : {}),
    ...(searchParams.departamento ? { departmentId: searchParams.departamento } : {}),
    ...(searchParams.status ? { active: searchParams.status === "ativo" } : {}),
  };

  const [employees, total, departments] = await Promise.all([
    db.user.findMany({
      where,
      include: { department: true, _count: { select: { enrollments: true } } },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.user.count({ where }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Funcionários</h1>
          <p className="text-sm text-navy-700/70">{total} funcionário(s) cadastrado(s)</p>
        </div>
        <ButtonLink href="/admin/funcionarios/novo">
          <Plus className="h-4 w-4" />
          Novo funcionário
        </ButtonLink>
      </div>

      <Suspense>
        <div className="flex flex-wrap gap-3">
          <SearchInput placeholder="Buscar por nome, e-mail ou cargo..." />
          <SelectFilter
            paramKey="departamento"
            placeholder="Todos os departamentos"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <SelectFilter
            paramKey="status"
            placeholder="Todos os status"
            options={[
              { value: "ativo", label: "Ativos" },
              { value: "inativo", label: "Inativos" },
            ]}
          />
        </div>
      </Suspense>

      {employees.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum funcionário encontrado" description="Ajuste os filtros ou cadastre um novo funcionário." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-navy-700/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Funcionário</th>
                  <th className="px-4 py-3 font-medium">Cargo</th>
                  <th className="px-4 py-3 font-medium">Departamento</th>
                  <th className="px-4 py-3 font-medium">Cursos</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Último acesso</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-surface-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.name} src={emp.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900">{emp.name}</p>
                          <p className="truncate text-xs text-navy-700/50">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-navy-700">{emp.position ?? "-"}</td>
                    <td className="px-4 py-3 text-navy-700">{emp.department?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-navy-700">{emp._count.enrollments}</td>
                    <td className="px-4 py-3">
                      <Badge tone={emp.active ? "success" : "danger"}>
                        {emp.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-700/60">{formatDateTime(emp.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/funcionarios/${emp.id}`}
                        className="text-sm font-medium text-accent-600 hover:underline"
                      >
                        Ver / editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Suspense>
            <Pagination page={page} totalPages={totalPages} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
