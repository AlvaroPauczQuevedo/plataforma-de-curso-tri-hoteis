"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { randomUUID } from "crypto";
import {
  bloqueioDeAlteracao,
  bloqueioDeVinculo,
  ehProprietario,
} from "@/lib/alcance-admin";

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

  const vinculo = await bloqueioDeVinculo(
    admin.id,
    parsed.data.departmentId || null
  );
  if (vinculo) return vinculo;

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

  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

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

  const vinculo = await bloqueioDeVinculo(
    admin.id,
    parsed.data.departmentId || null
  );
  if (vinculo) return vinculo;

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

/**
 * Ativa ou desativa um acesso.
 *
 * Agora que administradores enxergam uns aos outros, duas travas passam a ser
 * necessarias — as duas evitam o mesmo desfecho: uma plataforma sem ninguem
 * capaz de administra-la, sem caminho de volta pela interface.
 */
export async function toggleEmployeeActive(userId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

  if (!active) {
    if (userId === admin.id) {
      return {
        ok: false,
        error: "Você não pode desativar o próprio acesso. Peça a outro administrador.",
      };
    }

    const alvo = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (alvo?.role === "ADMIN") {
      const administradoresAtivos = await db.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (administradoresAtivos <= 1) {
        return {
          ok: false,
          error: "Este é o último administrador ativo. Ative outro antes de desativar este.",
        };
      }
    }
  }

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

  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

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

/**
 * Gera um link de redefinição de senha para um funcionário.
 *
 * Fica no painel administrativo (e não na tela pública /esqueci-senha) porque
 * quem recebe o link assume a conta: exposto publicamente, bastaria saber o
 * e-mail de alguém para tomar o acesso dele. O administrador entrega o link
 * ao funcionário pelo canal interno enquanto não há envio de e-mail.
 */
export async function generatePasswordResetLink(
  userId: string
): Promise<ActionResult & { resetLink?: string }> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Funcionário não encontrado." };
  if (!target.active) {
    return { ok: false, error: "Reative o acesso antes de gerar um link de redefinição." };
  }

  // Invalida links anteriores ainda pendentes deste usuário.
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomUUID();
  await db.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "GERAR_LINK_REDEFINICAO",
    targetType: "User",
    targetId: userId,
    details: target.name,
  });

  return {
    ok: true,
    message: "Link válido por 1 hora e de uso único.",
    resetLink: `/redefinir-senha/${token}`,
  };
}

export async function createDepartment(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  // Criar departamento é decidir a estrutura da plataforma, e só o proprietário
  // consegue atribuir alguém a um. Aberto a todos, geraria só departamentos
  // órfãos que ninguém pode usar.
  if (!(await ehProprietario(admin.id))) {
    return {
      ok: false,
      error: "Só o proprietário da plataforma pode criar departamentos.",
    };
  }

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
