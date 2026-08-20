"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { randomUUID } from "crypto";

const employeeSchema = z.object({
  name: z.string().min(2, "Informe o nome completo."),
  email: z.string().email("E-mail inválido."),
  position: z.string().optional(),
  departmentId: z.string().optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = employeeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    position: formData.get("position") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    role: formData.get("role") || "EMPLOYEE",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
  });
  if (existing) {
    return { ok: false, error: "Já existe um usuário com este e-mail." };
  }

  const tempPassword = randomUUID().slice(0, 10);
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      position: parsed.data.position,
      departmentId: parsed.data.departmentId || null,
      role: parsed.data.role,
      passwordHash,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_FUNCIONARIO",
    targetType: "User",
    targetId: user.id,
    details: `Funcionário ${user.name} cadastrado. Senha temporária: ${tempPassword}`,
  });

  revalidatePath("/admin/funcionarios");
  return {
    ok: true,
    message: `Funcionário cadastrado. Senha temporária: ${tempPassword}`,
  };
}

export async function updateEmployee(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = employeeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    position: formData.get("position") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    role: formData.get("role") || "EMPLOYEE",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const existing = await db.user.findFirst({
    where: { email: parsed.data.email.toLowerCase().trim(), NOT: { id: userId } },
  });
  if (existing) {
    return { ok: false, error: "Já existe outro usuário com este e-mail." };
  }

  await db.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      position: parsed.data.position,
      departmentId: parsed.data.departmentId || null,
      role: parsed.data.role,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "EDITAR_FUNCIONARIO",
    targetType: "User",
    targetId: userId,
  });

  revalidatePath("/admin/funcionarios");
  revalidatePath(`/admin/funcionarios/${userId}`);
  return { ok: true, message: "Funcionário atualizado com sucesso." };
}

export async function toggleEmployeeActive(userId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();

  const target = await db.user.update({ where: { id: userId }, data: { active } });

  await logAdminActivity({
    adminId: admin.id,
    action: active ? "ATIVAR_FUNCIONARIO" : "DESATIVAR_FUNCIONARIO",
    targetType: "User",
    targetId: userId,
    details: target.name,
  });

  revalidatePath("/admin/funcionarios");
  return { ok: true, message: active ? "Acesso ativado." : "Acesso desativado." };
}

export async function resetEmployeePassword(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const tempPassword = randomUUID().slice(0, 10);
  const passwordHash = await hashPassword(tempPassword);

  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  await logAdminActivity({
    adminId: admin.id,
    action: "REDEFINIR_SENHA",
    targetType: "User",
    targetId: userId,
  });

  revalidatePath(`/admin/funcionarios/${userId}`);
  return { ok: true, message: `Nova senha temporária: ${tempPassword}` };
}

export async function createDepartment(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!name?.trim()) return { ok: false, error: "Informe o nome do departamento." };

  const existing = await db.department.findUnique({ where: { name: name.trim() } });
  if (existing) return { ok: false, error: "Departamento já existe." };

  await db.department.create({ data: { name: name.trim() } });
  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_DEPARTAMENTO",
    targetType: "Department",
    details: name,
  });

  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}
