"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { ActionResult } from "@/lib/actions/employees";

/**
 * Não há serviço de e-mail configurado neste ambiente de demonstração.
 * O link de redefinição é devolvido diretamente para exibição em tela,
 * simulando o que seria enviado por e-mail em produção.
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult & { resetLink?: string }> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { ok: false, error: "Informe um e-mail válido." };
  }

  const user = await db.user.findUnique({
    where: { email: email.data.toLowerCase().trim() },
  });

  // Não revelamos se o e-mail existe ou não, por segurança.
  if (!user || !user.active) {
    return {
      ok: true,
      message: "Se o e-mail existir em nossa base, um link de redefinição foi gerado.",
    };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  return {
    ok: true,
    message: "Link de redefinição gerado com sucesso.",
    resetLink: `/redefinir-senha/${token}`,
  };
}

const resetSchema = z
  .object({
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export async function resetPassword(token: string, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const resetToken = await db.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { ok: false, error: "Este link de redefinição é inválido ou expirou." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await db.$transaction([
    db.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  return { ok: true, message: "Senha redefinida com sucesso. Você já pode entrar." };
}
