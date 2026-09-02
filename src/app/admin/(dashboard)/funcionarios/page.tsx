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
import { IntranetSyncPanel } from "@/components/admin/intranet-sync-panel";
import { syncDisponivel } from "@/lib/intranet-sync";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 10;

export default async function FuncionariosPage(
  props: {
    searchParams: Promise<{
      q?: string;
      departamento?: string;
      status?: string;
      papel?: string;
      page?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const admin = await requireAdmin();

  const page = Math.max(1, Number(searchParams.page ?? 1));
  /*
    A lista mostra TODAS as contas, inclusive as administrativas. Antes ela
    filtrava por EMPLOYEE, e o efeito era que administradores ficavam
    invisiveis entre si: ninguem conseguia redefinir a senha de um colega nem
    desativar um acesso administrativo que precisasse sair.
  */
  const where = {
    ...(searchParams.papel === "admin" ? { role: "ADMIN" as const } : {}),
    ...(searchParams.papel === "funcionario" ? { role: "EMPLOYEE" as const } : {}),
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
          <h1 className="text-2xl font-semibold text-ink-900">Usuários</h1>
          <p className="text-sm text-ink-700/70">
            {total} conta(s) — funcionários e administradores
          </p>
        </div>
        <ButtonLink href="/admin/funcionarios/novo">
          <Plus className="h-4 w-4" />
          Novo usuário
        </ButtonLink>
      </div>

      {/*
        A plataforma funciona sozinha. O bloco da intranet só existe quando
        INTRANET_DB_PATH aponta para o cadastro dela — sem isso, nada aqui
        menciona um segundo sistema.
      */}
      {syncDisponivel() && <IntranetSyncPanel />}

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
          <SelectFilter
            paramKey="papel"
            placeholder="Todos os perfis"
            options={[
              { value: "funcionario", label: "Funcionários" },
              { value: "admin", label: "Administradores" },
            ]}
          />
        </div>
      </Suspense>

      {employees.length === 0 ? (
        <EmptyState icon={Users} title="Nenhuma conta encontrada" description="Ajuste os filtros ou cadastre um novo usuário." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-700/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Usuário</th>
                  <th className="px-4 py-3 font-medium">Perfil</th>
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
                          <p className="truncate font-medium text-ink-900">{emp.name}</p>
                          <p className="truncate text-xs text-ink-700/50">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {emp.role === "ADMIN" ? (
                        <Badge tone="accent">Administrador</Badge>
                      ) : (
                        <Badge tone="neutral">Funcionário</Badge>
                      )}
                      {emp.protegido && (
                        <Badge tone="navy" className="ml-1.5">Protegida</Badge>
                      )}
                      {emp.id === admin.id && (
                        <span className="ml-1.5 text-xs text-ink-700/50">você</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{emp.position ?? "-"}</td>
                    <td className="px-4 py-3 text-ink-700">{emp.department?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-ink-700">{emp._count.enrollments}</td>
                    <td className="px-4 py-3">
                      <Badge tone={emp.active ? "success" : "danger"}>
                        {emp.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-700/60">{formatDateTime(emp.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/funcionarios/${emp.id}`}
                        className="text-sm font-medium text-brand-700 hover:underline"
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
