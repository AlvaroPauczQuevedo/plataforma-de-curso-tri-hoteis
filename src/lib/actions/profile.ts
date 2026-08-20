"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { ActionResult } from "@/lib/actions/employees";

const profileSchema = z.object({
  name: z.string().min(2, "Informe o nome completo."),
});

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const avatarFileId = (formData.get("avatarFileId") as string) || undefined;

  await db.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      ...(avatarFileId ? { avatarUrl: `/api/files/${avatarFileId}` } : {}),
    },
  });

  revalidatePath("/perfil");
  return { ok: true, message: "Perfil atualizado com sucesso." };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe sua senha atual."),
    newPassword: z.string().min(6, "A nova senha deve ter ao menos 6 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const sessionUser = await requireUser();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const user = await db.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { ok: false, error: "Usuário não encontrado." };

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "Senha atual incorreta." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { ok: true, message: "Senha alterada com sucesso." };
}
