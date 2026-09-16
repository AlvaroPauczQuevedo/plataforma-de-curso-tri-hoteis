"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword, senhaProvisoria } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { novoTokenDeRedefinicao } from "@/lib/token-de-redefinicao";
import { emailDeRedefinicao, emailDeSenhaProvisoria, enviarEmail } from "@/lib/email";
import { bloqueioDeAlteracao } from "@/lib/alcance-admin";
import type { ActionResult } from "@/lib/actions/resultado";

/**
 * Ligar, desligar e devolver acesso.
 *
 * Saiu de `actions/employees` junto com a redefinição de senha: é uma pergunta
 * diferente da do cadastro. Lá se decide QUEM a pessoa é na plataforma; aqui,
 * se ela consegue entrar hoje — e as três funções abaixo são as únicas que
 * mexem em credencial de outra pessoa, o que é motivo suficiente para ficarem
 * juntas e visíveis num arquivo só.
 */

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

  const tempPassword = senhaProvisoria();
  const passwordHash = await hashPassword(tempPassword);

  /*
    Redefinir a senha destrava a conta.

    O bloqueio por tentativas seguidas é conferido ANTES da comparação da
    senha (lib/login-guard), então uma conta bloqueada continuava recusando o
    acesso mesmo com a senha nova — e este é justamente o caminho que a pessoa
    toma depois de errar a senha cinco vezes: pedir ao administrador uma nova.
    Ela recebia a senha e ainda assim não entrava, sem nada na tela explicando.
  */
  const alvo = await db.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "REDEFINIR_SENHA",
    targetType: "User",
    targetId: userId,
  });

  /*
    Só envia para quem TEM endereço confirmado — hoje a minoria.

    A senha ainda aparece na tela nos dois casos: quem administra precisa poder
    entregá-la em mãos sem depender de a mensagem ter saído, e é assim que a
    maior parte da rede vai receber.
  */
  const envio = alvo.email
    ? await enviarEmail(emailDeSenhaProvisoria(alvo.name, alvo.email, alvo.username, tempPassword))
    : null;

  revalidatePath(`/admin/funcionarios/${userId}`);
  return {
    ok: true,
    message: envio?.enviado
      ? `Nova senha enviada para ${alvo.email}. Senha: ${tempPassword}`
      : `Nova senha provisória: ${tempPassword}`,
  };
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

  // O link e o e-mail levam o token; o banco, só o digest.
  const { token, digest } = novoTokenDeRedefinicao();
  await db.passwordResetToken.create({
    data: { userId, token: digest, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "GERAR_LINK_REDEFINICAO",
    targetType: "User",
    targetId: userId,
    details: target.name,
  });

  // Só há para onde enviar quando a pessoa confirmou um endereço. Sem isso, o
  // link fica só na tela, para o administrador entregar pelo canal interno —
  // que é como a maior parte desta rede recebe.
  const envio = target.email
    ? await enviarEmail(emailDeRedefinicao(target.name, target.email, token))
    : null;

  return {
    ok: true,
    message: envio?.enviado
      ? `Link enviado para ${target.email}. Válido por 1 hora e de uso único.`
      : "Link válido por 1 hora e de uso único.",
    resetLink: `/redefinir-senha/${token}`,
  };
}
