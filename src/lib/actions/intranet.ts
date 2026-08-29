"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { sincronizarComIntranet, syncDisponivel, type SyncOutcome } from "@/lib/intranet-sync";
import type { ActionResult } from "@/lib/actions/employees";

export type SyncResult =
  | { ok: true; resumo: SyncOutcome }
  | { ok: false; error: string };

/**
 * Traz o cadastro de funcionários da intranet para esta plataforma.
 *
 * As senhas provisórias das contas novas voltam na resposta e são exibidas
 * uma única vez, para o administrador entregá-las. Elas não ficam guardadas
 * em lugar nenhum — só o hash é gravado.
 */
export async function sincronizarFuncionarios(): Promise<SyncResult> {
  const admin = await requireAdmin();

  if (!syncDisponivel()) {
    return {
      ok: false,
      error:
        "Sincronização não configurada. Defina INTRANET_DB_PATH no arquivo .env apontando para o banco da intranet.",
    };
  }

  try {
    const resumo = await sincronizarComIntranet();

    await logAdminActivity({
      adminId: admin.id,
      action: "SINCRONIZAR_INTRANET",
      targetType: "User",
      details:
        `${resumo.criados.length} criado(s), ${resumo.atualizados} atualizado(s), ` +
        `${resumo.desativados} desativado(s), ${resumo.ignorados.length} ignorado(s)`,
    });

    revalidatePath("/admin/funcionarios");
    revalidatePath("/admin");
    return { ok: true, resumo };
  } catch (erro) {
    return { ok: false, error: (erro as Error).message };
  }
}

const trocaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual."),
    novaSenha: z.string().min(6, "A nova senha deve ter ao menos 6 caracteres."),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    message: "As senhas não coincidem.",
    path: ["confirmacao"],
  })
  .refine((dados) => dados.novaSenha !== dados.senhaAtual, {
    message: "A nova senha precisa ser diferente da provisória.",
    path: ["novaSenha"],
  });

/**
 * Troca obrigatória da senha provisória.
 *
 * Enquanto `mustChangePassword` estiver marcado, o portal redireciona para
 * esta troca: a senha provisória passou pelas mãos do administrador e não
 * pode continuar valendo.
 */
export async function trocarSenhaProvisoria(formData: FormData): Promise<ActionResult> {
  const usuario = await requireUser();

  const parsed = trocaSchema.safeParse({
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
    confirmacao: formData.get("confirmacao"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const registro = await db.user.findUnique({ where: { id: usuario.id } });
  if (!registro) return { ok: false, error: "Usuário não encontrado." };

  const confere = await verifyPassword(parsed.data.senhaAtual, registro.passwordHash);
  if (!confere) return { ok: false, error: "A senha atual não confere." };

  await db.user.update({
    where: { id: registro.id },
    data: {
      passwordHash: await hashPassword(parsed.data.novaSenha),
      mustChangePassword: false,
    },
  });

  revalidatePath("/");
  return { ok: true, message: "Senha alterada. Bom estudo!" };
}
