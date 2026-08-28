"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { ActionResult } from "@/lib/actions/employees";

/** Resposta idêntica exista ou não o e-mail, para não revelar a base. */
const MENSAGEM_NEUTRA =
  "Se este e-mail estiver cadastrado, a solicitação foi registrada. " +
  "Procure o administrador do treinamento para receber o link de redefinição.";

/**
 * Registra um pedido de redefinição de senha.
 *
 * O token é gravado para que o envio por e-mail possa ser plugado sem
 * mudar o fluxo, mas o link NUNCA é devolvido para quem preencheu o
 * formulário: como esta tela é pública, devolvê-lo permitiria que qualquer
 * pessoa que soubesse o e-mail de um funcionário assumisse a conta dele.
 * Enquanto não houver serviço de e-mail configurado, o link é entregue pelo
 * administrador em /admin/funcionarios (ver generatePasswordResetLink).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { ok: false, error: "Informe um e-mail válido." };
  }

  const user = await db.user.findUnique({
    where: { email: email.data.toLowerCase().trim() },
  });

  // Não revelamos se o e-mail existe ou não, por segurança.
  if (!user || !user.active) {
    return { ok: true, message: MENSAGEM_NEUTRA };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  return {
    ok: true,
    message: MENSAGEM_NEUTRA,
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
