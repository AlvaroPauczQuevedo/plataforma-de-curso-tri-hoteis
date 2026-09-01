"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { ActionResult } from "@/lib/actions/employees";
import { emailDeRedefinicao, enviarEmail, envioDisponivel } from "@/lib/email";

/**
 * Resposta idêntica exista ou não o e-mail, para não revelar a base.
 *
 * O texto muda conforme haja SMTP configurado, mas nunca conforme o e-mail
 * exista — senão a própria diferença de mensagem revelaria quem é cadastrado.
 */
const MENSAGEM_COM_EMAIL =
  "Se este e-mail estiver cadastrado, o link de redefinição foi enviado para ele. " +
  "O link vale por 1 hora. Confira também a caixa de spam.";

const MENSAGEM_SEM_EMAIL =
  "Se este e-mail estiver cadastrado, a solicitação foi registrada. " +
  "Procure o administrador do treinamento para receber o link de redefinição.";

/**
 * Registra um pedido de redefinição de senha.
 *
 * O link NUNCA é devolvido para quem preencheu o formulário: como esta tela é
 * pública, devolvê-lo permitiria que qualquer pessoa que soubesse o e-mail de
 * um funcionário assumisse a conta dele. Ele só sai por e-mail, para o próprio
 * endereço da conta — quem não tem acesso à caixa não recebe nada.
 *
 * Sem SMTP configurado, o token continua sendo gravado e o administrador o
 * entrega pelo painel (ver generatePasswordResetLink).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { ok: false, error: "Informe um e-mail válido." };
  }

  const mensagem = envioDisponivel() ? MENSAGEM_COM_EMAIL : MENSAGEM_SEM_EMAIL;

  const user = await db.user.findUnique({
    where: { email: email.data.toLowerCase().trim() },
  });

  // Não revelamos se o e-mail existe ou não, por segurança.
  if (!user || !user.active) {
    return { ok: true, message: mensagem };
  }

  // Invalida pedidos anteriores ainda pendentes: sem isto, cada tentativa
  // deixaria mais um link válido circulando por uma hora.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  await enviarEmail(emailDeRedefinicao(user.name, user.email, token));

  return { ok: true, message: mensagem };
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
    /*
      A pessoa escolheu a própria senha: a exigência de troca deixa de fazer
      sentido, senão o primeiro acesso pediria a troca de novo.

      O contador de tentativas zera junto. O bloqueio por tentativas seguidas
      é conferido antes da comparação da senha (lib/login-guard), então sem
      isto quem foi bloqueado e redefiniu a senha continuava barrado por até
      quinze minutos, com a senha certa em mãos e nenhuma explicação na tela.
    */
    db.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
      },
    }),
    db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  return { ok: true, message: "Senha redefinida com sucesso. Você já pode entrar." };
}
