"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { bloqueioDeCurso, type Recusa } from "@/lib/alcance-admin";
import { ipDaRequisicao } from "@/lib/login-guard";
import {
  aceitaCheckIn,
  codigoValido,
  novoSegredoDeSessao,
  presencasParaConcluir,
} from "@/lib/presenca";
import type { ActionResult } from "@/lib/actions/employees";

const sessaoSchema = z.object({
  courseId: z.string().min(1, "Escolha o treinamento."),
  instrutor: z.string().min(3, "Informe quem aplicou o treinamento."),
  titulo: z.string().optional(),
  local: z.string().optional(),
  /** Minutos que a sessão fica aberta. */
  duracaoMinutos: z.coerce.number().int().min(5).max(600),
});

/** Só quem alcança o curso abre sessão dele. Mesma trava de todo o resto. */
async function bloqueioDaSessao(sessaoId: string, adminId: string): Promise<Recusa | null> {
  const sessao = await db.sessaoPresencial.findUnique({
    where: { id: sessaoId },
    select: { courseId: true },
  });
  if (!sessao) return { ok: false, error: "Sessão não encontrada." };
  return bloqueioDeCurso(sessao.courseId, adminId);
}

/**
 * Abre a sessão e gera o segredo do código rotativo.
 *
 * A sessão nasce ABERTA, ao contrário da trilha e do documento, que nascem
 * rascunho. Aqui é o oposto deles: o instrutor está na sala com a turma
 * esperando, e um segundo clique para "publicar" seria atrito puro no pior
 * momento. O que protege não é o rascunho — é o código girar.
 */
export async function abrirSessaoPresencial(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdmin();

  const parsed = sessaoSchema.safeParse({
    courseId: formData.get("courseId"),
    instrutor: formData.get("instrutor"),
    titulo: formData.get("titulo") || undefined,
    local: formData.get("local") || undefined,
    duracaoMinutos: formData.get("duracaoMinutos") || 120,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const bloqueio = await bloqueioDeCurso(parsed.data.courseId, admin.id);
  if (bloqueio) return bloqueio;

  const agora = new Date();
  const sessao = await db.sessaoPresencial.create({
    data: {
      courseId: parsed.data.courseId,
      titulo: parsed.data.titulo ?? null,
      instrutor: parsed.data.instrutor,
      local: parsed.data.local ?? null,
      segredo: novoSegredoDeSessao(),
      realizadaEm: agora,
      abertaAte: new Date(agora.getTime() + parsed.data.duracaoMinutos * 60_000),
      criadaPorId: admin.id,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "ABRIR_SESSAO_PRESENCIAL",
    targetType: "SessaoPresencial",
    targetId: sessao.id,
    details: parsed.data.titulo ?? parsed.data.instrutor,
  });

  revalidatePath("/admin/presenca");
  return { ok: true, id: sessao.id };
}

/**
 * O bipe do funcionário. Chamado pela tela que o QR abre.
 *
 * Roda como o USUÁRIO, não como administrador: quem marca presença é quem
 * está na sala, com a própria conta. É por isso que o código sozinho não
 * basta — ele prova que a pessoa está vendo a tela agora; a sessão prova quem
 * ela é.
 */
export async function registrarPresenca(
  sessaoId: string,
  codigo: string
): Promise<ActionResult> {
  const usuario = await requireUser();

  const sessao = await db.sessaoPresencial.findUnique({
    where: { id: sessaoId },
    select: {
      segredo: true,
      abertaAte: true,
      encerradaEm: true,
      course: { select: { title: true } },
    },
  });
  if (!sessao) return { ok: false, error: "Sessão não encontrada." };

  const agora = new Date();
  if (!aceitaCheckIn(sessao, agora)) {
    return {
      ok: false,
      error: "Esta lista de presença já foi fechada. Procure quem aplicou o treinamento.",
    };
  }

  /*
    O código é conferido DEPOIS do estado da sessão, mas a mensagem de recusa é
    a mesma para código errado e código velho. Distinguir os dois só ajudaria
    quem está tentando adivinhar — e para quem está na sala a ação é idêntica:
    ler de novo o código que está na tela.
  */
  if (!codigoValido(sessao.segredo, codigo, agora)) {
    return {
      ok: false,
      error: "Código expirado. Aponte a câmera de novo para o código que está na tela.",
    };
  }

  /*
    Administrador não bipa. Ele aplica o treinamento; matriculá-lo no próprio
    curso encheria o portal dele com o que ele mesmo ministrou — a mesma razão
    pela qual a matrícula automática o deixa de fora.
  */
  if (usuario.role !== "EMPLOYEE") {
    return { ok: false, error: "Contas administrativas não entram na lista de presença." };
  }

  const cabecalhos = await headers();
  const ipDoPedido = ipDaRequisicao(Object.fromEntries(cabecalhos.entries()));

  // Bipar duas vezes é o mesmo que bipar uma.
  await db.presencaEmSessao.upsert({
    where: { sessaoId_userId: { sessaoId, userId: usuario.id } },
    create: { sessaoId, userId: usuario.id, ip: ipDoPedido },
    update: {},
  });

  revalidatePath("/admin/presenca");
  return { ok: true, message: `Presença confirmada em ${sessao.course.title}.` };
}

/** Tira alguém da lista antes de encerrar — o bipe errado, corrigido a tempo. */
export async function removerPresenca(sessaoId: string, userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaSessao(sessaoId, admin.id);
  if (bloqueio) return bloqueio;

  const sessao = await db.sessaoPresencial.findUnique({
    where: { id: sessaoId },
    select: { encerradaEm: true },
  });
  /*
    Depois de encerrada, não. A lista virou conclusão registrada, e apagar a
    presença deixaria a conclusão sem a origem que a explica. Para desfazer
    aquilo existe a tela de treinamento presencial, onde a conclusão é removida
    com nome e responsável.
  */
  if (sessao?.encerradaEm) {
    return {
      ok: false,
      error: "A sessão já foi encerrada. Remova a conclusão pela tela de treinamento presencial.",
    };
  }

  await db.presencaEmSessao.deleteMany({ where: { sessaoId, userId } });

  revalidatePath("/admin/presenca");
  return { ok: true };
}

/**
 * Encerra a sessão e transforma a lista em conclusões.
 *
 * É AQUI que o registro de conformidade nasce, e não no bipe. O instrutor vê a
 * lista, tira quem bipou por engano, e só então confirma — um clique errado
 * antes disso é uma linha para remover, não um "fulano está treinado em
 * brigada de incêndio" que depois alguém precisa descobrir que é falso.
 *
 * Idempotente: encerrar de novo não duplica nada, porque
 * `presencasParaConcluir` pula quem já tem conclusão e o `encerradaEm` barra a
 * segunda passagem.
 */
export async function encerrarSessaoPresencial(
  sessaoId: string
): Promise<ActionResult & { criadas?: number }> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDaSessao(sessaoId, admin.id);
  if (bloqueio) return bloqueio;

  const sessao = await db.sessaoPresencial.findUnique({
    where: { id: sessaoId },
    select: {
      id: true,
      courseId: true,
      instrutor: true,
      local: true,
      realizadaEm: true,
      encerradaEm: true,
      presencas: { select: { userId: true } },
      course: { select: { title: true } },
    },
  });
  if (!sessao) return { ok: false, error: "Sessão não encontrada." };
  if (sessao.encerradaEm) return { ok: false, error: "Esta sessão já foi encerrada." };

  const jaConcluiram = new Set(
    (
      await db.conclusaoExterna.findMany({
        where: {
          courseId: sessao.courseId,
          userId: { in: sessao.presencas.map((p) => p.userId) },
        },
        select: { userId: true },
      })
    ).map((c) => c.userId)
  );

  const novos = presencasParaConcluir(sessao.presencas, jaConcluiram);

  if (novos.length > 0) {
    await db.conclusaoExterna.createMany({
      data: novos.map((userId) => ({
        userId,
        courseId: sessao.courseId,
        // A data do TREINAMENTO, não a do encerramento: é dela que a
        // reciclagem conta a validade.
        concluidoEm: sessao.realizadaEm,
        instrutor: sessao.instrutor,
        observacao: `Check-in por QR${sessao.local ? ` — ${sessao.local}` : ""}`,
        registradoPorId: admin.id,
      })),
    });
  }

  await db.sessaoPresencial.update({
    where: { id: sessaoId },
    data: { encerradaEm: new Date() },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "ENCERRAR_SESSAO_PRESENCIAL",
    targetType: "SessaoPresencial",
    targetId: sessaoId,
    details: `${sessao.course.title} — ${novos.length} conclusão(ões)`,
  });

  revalidatePath("/admin/presenca");
  revalidatePath("/admin/conformidade");
  revalidatePath("/trilhas");
  return {
    ok: true,
    criadas: novos.length,
    message:
      novos.length === sessao.presencas.length
        ? `${novos.length} conclusão(ões) registrada(s).`
        : `${novos.length} nova(s); ${sessao.presencas.length - novos.length} já tinham conclusão neste treinamento.`,
  };
}
