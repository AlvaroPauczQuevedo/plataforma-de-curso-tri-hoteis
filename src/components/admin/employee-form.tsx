"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/shared/action-form";
import { createEmployee, updateEmployee } from "@/lib/actions/employees";
import type { Department, User } from "@prisma/client";

export function EmployeeForm({
  departments,
  employee,
}: {
  departments: Department[];
  employee?: User;
}) {
  const router = useRouter();
  const isEdit = Boolean(employee);

  return (
    <ActionForm
      action={(formData) =>
        isEdit ? updateEmployee(employee!.id, formData) : createEmployee(formData)
      }
      submitLabel={isEdit ? "Salvar alterações" : "Cadastrar funcionário"}
      onSuccess={() => {
        if (!isEdit) {
          setTimeout(() => router.push("/admin/funcionarios"), 1600);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ink-900">
            Nome completo
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={employee?.name}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink-900">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={employee?.email}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="position" className="text-sm font-medium text-ink-900">
            Cargo
          </label>
          <input
            id="position"
            name="position"
            defaultValue={employee?.position ?? ""}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="departmentId" className="text-sm font-medium text-ink-900">
            Departamento
          </label>
          <select
            id="departmentId"
            name="departmentId"
            defaultValue={employee?.departmentId ?? ""}
            className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            <option value="">Selecione...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="role" className="text-sm font-medium text-ink-900">
          Nível de acesso
        </label>
        <select
          id="role"
          name="role"
          defaultValue={employee?.role ?? "EMPLOYEE"}
          className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 sm:w-64"
        >
          <option value="EMPLOYEE">Funcionário</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
    </ActionForm>
  );
}
