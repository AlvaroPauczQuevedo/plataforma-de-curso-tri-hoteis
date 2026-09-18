"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { bloqueioDeCurso } from "@/lib/alcance-admin";
import { ipDaRequisicao } from "@/lib/login-guard";
import { TERMO_DE_HABILITACAO } from "@/lib/habilitacao";
import type { ActionResult } from "@/lib/actions/resultado";

const habilitacaoSchema = z.object({
  instrutor: z.string().min(3, "Informe o nome de quem aplica o treinamento."),
  registro: z.string().optional(),
  arquivoId: z.string().min(1, "Anexe o comprovante de habilitação."),
  validoAte: z.string().optional(),
  /*
    O aceite do termo é um campo do formulário, e obrigatório. Não é caixa
    marcada por padrão nem consentimento presumido pelo envio: quem anexa
    assume responsabilidade pessoal pelo documento, e isso exige um ato.
  */
  aceitouTermo: z.literal("sim", {
    errorMap: () => ({ message: "É preciso aceitar o termo de responsabilidade." }),
  }),
});

/**
 * Anexa o comprovante de habilitação do instrutor a um curso.
 *
 * Grava, junto: **quem** declarou, **quando**, **de onde** e **o texto do termo
 * como estava** no momento. É esse conjunto que transforma "a empresa não
 * sabia" em uma declaração pessoal, datada e rastreável.
 *
 * A plataforma **não valida** a autenticidade do documento — não há como. Ela
 * exige, registra e responsabiliza. Fingir que valida seria pior: daria
 * segurança falsa a quem confia na tela.
 */
export async function anexarHabilitacao(
  courseId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = habilitacaoSchema.safeParse({
    instrutor: formData.get("instrutor"),
    registro: formData.get("registro") || undefined,
    arquivoId: formData.get("arquivoId"),
    validoAte: formData.get("validoAte") || undefined,
    aceitouTermo: formData.get("aceitouTermo"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const arquivo = await db.fileAsset.findUnique({
    where: { id: parsed.data.arquivoId },
    select: { mimeType: true },
  });
  if (!arquivo) return { ok: false, error: "Arquivo não encontrado. Envie o comprovante novamente." };
  /*
    PDF, como o resto dos documentos da plataforma. Aceitar foto de carteira de
    conselho seria mais cômodo para quem está no celular, mas exigiria um tipo
    novo de upload — e o canal de PDF já é o testado, com verificação de
    assinatura de arquivo. Quem só tem foto gera um PDF dela.
  */
  if (arquivo.mimeType !== "application/pdf") {
    return { ok: false, error: "O comprovante precisa ser um PDF." };
  }

  let validoAte: Date | null = null;
  if (parsed.data.validoAte) {
    const data = new Date(`${parsed.data.validoAte}T12:00:00`);
    if (Number.isNaN(data.getTime())) {
      return { ok: false, error: "Data de validade inválida." };
    }
    /*
      Meio-dia, e não meia-noite: a validade é um DIA, e a meia-noite em fuso
      negativo cai no dia anterior em UTC — o comprovante venceria um dia antes
      do que está escrito no papel.
    */
    validoAte = data;
  }

  const cabecalhos = await headers();

  await db.habilitacaoDeInstrutor.create({
    data: {
      courseId,
      instrutor: parsed.data.instrutor,
      registro: parsed.data.registro ?? null,
      arquivoId: parsed.data.arquivoId,
      validoAte,
      declaradoPorId: admin.id,
      ip: ipDaRequisicao(Object.fromEntries(cabecalhos.entries())),
      // Por extenso: o termo pode mudar, e o que vale é o que foi lido.
      termoAceito: TERMO_DE_HABILITACAO,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "ANEXAR_HABILITACAO",
    targetType: "Course",
    targetId: courseId,
    details: parsed.data.instrutor,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true, message: "Comprovante anexado. Você respondeu por esta declaração." };
}

/**
 * Remove um comprovante.
 *
 * Permitido, mas registrado — o histórico guarda quem tirou. Um comprovante
 * anexado por engano precisa sair; um removido para esconder algo deixa rastro.
 *
 * Não despublica o curso sozinho: tirar um treinamento do ar no meio de uma
 * turma é decisão de quem responde por ele, não efeito colateral de uma
 * remoção. A tela passa a avisar em alto contraste.
 */
export async function removerHabilitacao(
  courseId: string,
  habilitacaoId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  const habilitacao = await db.habilitacaoDeInstrutor.findUnique({
    where: { id: habilitacaoId },
    select: { courseId: true, instrutor: true },
  });
  if (!habilitacao || habilitacao.courseId !== courseId) {
    return { ok: false, error: "Comprovante não encontrado neste curso." };
  }

  await db.habilitacaoDeInstrutor.delete({ where: { id: habilitacaoId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "REMOVER_HABILITACAO",
    targetType: "Course",
    targetId: courseId,
    details: habilitacao.instrutor,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true };
}

/** Marca (ou desmarca) que o treinamento exige instrutor habilitado. */
export async function definirExigenciaDeHabilitacao(
  courseId: string,
  exige: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeCurso(courseId, admin.id);
  if (bloqueio) return bloqueio;

  await db.course.update({
    where: { id: courseId },
    data: { exigeInstrutorHabilitado: exige },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: exige ? "EXIGIR_HABILITACAO" : "DISPENSAR_HABILITACAO",
    targetType: "Course",
    targetId: courseId,
  });

  revalidatePath(`/admin/cursos/${courseId}`);
  return { ok: true };
}
