"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { bloqueioDeAlteracao } from "@/lib/alcance-admin";
import type { ActionResult } from "@/lib/actions/employees";

/**
 * Reconhecimento de treinamento feito FORA da plataforma.
 *
 * A plataforma só conhecia o que ela mesma entregou, e numa rede hoteleira boa
 * parte do treinamento obrigatório é presencial — brigada de incêndio exige
 * prática, manipulação de alimentos costuma ser em sala. O efeito era a
 * Conformidade cobrar quem já tinha feito, e o relatório de auditoria sair
 * incompleto afirmando estar completo.
 *
 * Isto é uma AFIRMAÇÃO sobre conformidade, feita por uma pessoa. Por isso o
 * registro guarda quem lançou e aparece no histórico administrativo: se um dia
 * for contestado, dá para saber quem disse o quê.
 */

const esquema = z.object({
  courseId: z.string().min(1, "Escolha o treinamento."),
  concluidoEm: z.string().min(1, "Informe a data de conclusão."),
  instrutor: z.string().trim().max(120).optional(),
  observacao: z.string().trim().max(500).optional(),
});

export async function registrarConclusaoExterna(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();

  /*
    A mesma trava de alterar a conta.

    Reconhecer treinamento muda a situação de conformidade de alguém, o que é
    tão sensível quanto editar o cadastro dele — e a conta protegida continua
    protegida também aqui.
  */
  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = esquema.safeParse({
    courseId: formData.get("courseId"),
    concluidoEm: formData.get("concluidoEm"),
    instrutor: formData.get("instrutor") || undefined,
    observacao: formData.get("observacao") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  /*
    A data vem de <input type="date"> como "2026-03-05", que o `new Date()` lê
    como meia-noite UTC — o mesmo critério de `dueDate`, e o mesmo que
    `formatPrazo` usa para exibir. Ler diferente aqui faria o registro aparecer
    um dia antes do que foi digitado.
  */
  const concluidoEm = new Date(parsed.data.concluidoEm);
  if (Number.isNaN(concluidoEm.getTime())) {
    return { ok: false, error: "Data de conclusão inválida." };
  }

  // Data no futuro é erro de digitação, e vira validade errada na reciclagem.
  if (concluidoEm.getTime() > Date.now()) {
    return { ok: false, error: "A data de conclusão não pode estar no futuro." };
  }

  const curso = await db.course.findUnique({
    where: { id: parsed.data.courseId },
    select: { id: true, title: true },
  });
  if (!curso) return { ok: false, error: "Treinamento não encontrado." };

  const jaExiste = await db.conclusaoExterna.findUnique({
    where: { userId_courseId: { userId, courseId: curso.id } },
  });
  if (jaExiste) {
    return {
      ok: false,
      error: `Já há um registro presencial de "${curso.title}" para esta pessoa. Remova o anterior para lançar outro.`,
    };
  }

  await db.conclusaoExterna.create({
    data: {
      userId,
      courseId: curso.id,
      concluidoEm,
      instrutor: parsed.data.instrutor || null,
      observacao: parsed.data.observacao || null,
      registradoPorId: admin.id,
    },
  });

  const alvo = await db.user.findUnique({ where: { id: userId }, select: { name: true } });

  await logAdminActivity({
    adminId: admin.id,
    action: "CONCLUSAO_EXTERNA",
    targetType: "User",
    targetId: userId,
    details: `Reconheceu "${curso.title}" como concluído presencialmente por ${alvo?.name ?? userId}.`,
  });

  revalidatePath(`/admin/funcionarios/${userId}`);
  revalidatePath("/admin/conformidade");

  return {
    ok: true,
    message:
      `"${curso.title}" reconhecido como concluído. A pessoa sai da lista de cobrança, ` +
      `e a reciclagem passa a contar a validade a partir desta data.`,
  };
}

/**
 * Desfaz o reconhecimento.
 *
 * Existe porque o registro é digitado por gente: data errada, pessoa errada,
 * curso errado. Sem esta saída, corrigir exigiria mexer no banco à mão.
 *
 * Apaga de verdade, em vez de marcar como cancelado, porque o histórico de
 * quem lançou e quem removeu já fica no AdminActivityLog — que é permanente e
 * é onde uma contestação seria respondida.
 */
export async function removerConclusaoExterna(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const registro = await db.conclusaoExterna.findUnique({
    where: { id },
    select: { userId: true, course: { select: { title: true } } },
  });
  if (!registro) return { ok: false, error: "Registro não encontrado." };

  const bloqueio = await bloqueioDeAlteracao(registro.userId, admin.id);
  if (bloqueio) return bloqueio;

  await db.conclusaoExterna.delete({ where: { id } });

  await logAdminActivity({
    adminId: admin.id,
    action: "CONCLUSAO_EXTERNA_REMOVIDA",
    targetType: "User",
    targetId: registro.userId,
    details: `Removeu o reconhecimento presencial de "${registro.course.title}".`,
  });

  revalidatePath(`/admin/funcionarios/${registro.userId}`);
  revalidatePath("/admin/conformidade");

  return { ok: true, message: "Reconhecimento removido." };
}
