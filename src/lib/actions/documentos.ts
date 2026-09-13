"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { bloqueioDeVinculo, ehProprietario, type Recusa } from "@/lib/alcance-admin";
import { documentoAlcanca, departamentosDaPessoa } from "@/lib/documentos";
import { ipDaRequisicao } from "@/lib/login-guard";
import type { ActionResult } from "@/lib/actions/employees";

const documentoSchema = z.object({
  titulo: z.string().min(3, "Informe um título para o documento."),
  descricao: z.string().optional(),
  arquivoId: z.string().min(1, "Anexe o PDF do documento."),
});

/**
 * Quem pode mexer neste documento.
 *
 * Espelha a regra do curso: um administrador comum alcança o que pertence aos
 * setores dele. Documento SEM departamento vale para a rede inteira, e aí só o
 * proprietário mexe — pelo mesmo motivo que curso sem departamento é reservado
 * a ele. Sem isso, qualquer administrador de setor publicaria uma política
 * para toda a empresa.
 */
async function bloqueioDeDocumento(
  departamentos: string[],
  adminId: string
): Promise<Recusa | null> {
  if (departamentos.length === 0) {
    return (await ehProprietario(adminId))
      ? null
      : {
          ok: false,
          error:
            "Documento sem departamento vale para a rede inteira; só o proprietário pode publicá-lo.",
        };
  }

  for (const departmentId of departamentos) {
    const bloqueio = await bloqueioDeVinculo(adminId, departmentId);
    if (bloqueio) return bloqueio;
  }
  return null;
}

export async function criarDocumento(formData: FormData): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdmin();

  const parsed = documentoSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    arquivoId: formData.get("arquivoId"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const departamentos = formData.getAll("departamentos").map(String).filter(Boolean);

  const bloqueio = await bloqueioDeDocumento(departamentos, admin.id);
  if (bloqueio) return bloqueio;

  // O anexo precisa existir e ser PDF: um documento que abre num visualizador
  // quebrado não vale como registro de que alguém leu.
  const arquivo = await db.fileAsset.findUnique({
    where: { id: parsed.data.arquivoId },
    select: { mimeType: true },
  });
  if (!arquivo) return { ok: false, error: "Arquivo não encontrado. Envie o PDF novamente." };
  if (arquivo.mimeType !== "application/pdf") {
    return { ok: false, error: "O documento precisa ser um PDF." };
  }

  const documento = await db.documento.create({
    data: {
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao ?? null,
      arquivoId: parsed.data.arquivoId,
      createdById: admin.id,
      departamentos: { create: departamentos.map((departmentId) => ({ departmentId })) },
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_DOCUMENTO",
    targetType: "Documento",
    targetId: documento.id,
    details: documento.titulo,
  });

  revalidatePath("/admin/documentos");
  return { ok: true, id: documento.id, message: "Documento criado como rascunho." };
}

/** Publica ou volta para rascunho. Rascunho não aparece para o funcionário. */
export async function publicarDocumento(id: string, publicado: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();

  const documento = await db.documento.findUnique({
    where: { id },
    select: { titulo: true, departamentos: { select: { departmentId: true } } },
  });
  if (!documento) return { ok: false, error: "Documento não encontrado." };

  const bloqueio = await bloqueioDeDocumento(
    documento.departamentos.map((d) => d.departmentId),
    admin.id
  );
  if (bloqueio) return bloqueio;

  await db.documento.update({ where: { id }, data: { publicado } });

  await logAdminActivity({
    adminId: admin.id,
    action: publicado ? "PUBLICAR_DOCUMENTO" : "DESPUBLICAR_DOCUMENTO",
    targetType: "Documento",
    targetId: id,
    details: documento.titulo,
  });

  revalidatePath("/admin/documentos");
  revalidatePath("/documentos");
  return { ok: true, message: publicado ? "Documento publicado." : "Documento voltou a rascunho." };
}

/**
 * Sobe uma revisão: novo PDF, versão + 1, e todo mundo volta a dever o aceite.
 *
 * Os aceites antigos NÃO são apagados — eles provam quem leu a versão anterior,
 * e é essa a pergunta que a auditoria faz sobre o passado. A pendência nova
 * nasce da comparação de versões, não da destruição do histórico.
 */
export async function novaVersaoDeDocumento(
  id: string,
  arquivoId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const documento = await db.documento.findUnique({
    where: { id },
    select: { titulo: true, versao: true, departamentos: { select: { departmentId: true } } },
  });
  if (!documento) return { ok: false, error: "Documento não encontrado." };

  const bloqueio = await bloqueioDeDocumento(
    documento.departamentos.map((d) => d.departmentId),
    admin.id
  );
  if (bloqueio) return bloqueio;

  const arquivo = await db.fileAsset.findUnique({
    where: { id: arquivoId },
    select: { mimeType: true },
  });
  if (!arquivo) return { ok: false, error: "Arquivo não encontrado. Envie o PDF novamente." };
  if (arquivo.mimeType !== "application/pdf") {
    return { ok: false, error: "O documento precisa ser um PDF." };
  }

  const novaVersao = documento.versao + 1;
  await db.documento.update({ where: { id }, data: { arquivoId, versao: novaVersao } });

  await logAdminActivity({
    adminId: admin.id,
    action: "REVISAR_DOCUMENTO",
    targetType: "Documento",
    targetId: id,
    details: `${documento.titulo} — versão ${novaVersao}`,
  });

  revalidatePath("/admin/documentos");
  revalidatePath("/documentos");
  return {
    ok: true,
    message: `Versão ${novaVersao} publicada. Quem já havia aceitado volta a constar como pendente.`,
  };
}

export async function excluirDocumento(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const documento = await db.documento.findUnique({
    where: { id },
    select: {
      titulo: true,
      departamentos: { select: { departmentId: true } },
      _count: { select: { aceites: true } },
    },
  });
  if (!documento) return { ok: false, error: "Documento não encontrado." };

  const bloqueio = await bloqueioDeDocumento(
    documento.departamentos.map((d) => d.departmentId),
    admin.id
  );
  if (bloqueio) return bloqueio;

  /*
    Documento com aceite não se exclui: apagá-lo levaria junto a prova de que
    as pessoas leram. Despublicar tira da frente delas e preserva o registro —
    é o mesmo princípio que impede desligamento de apagar certificado.
  */
  if (documento._count.aceites > 0) {
    return {
      ok: false,
      error:
        `Este documento já tem ${documento._count.aceites} aceite(s) registrado(s) e não pode ser excluído. ` +
        "Use “voltar para rascunho” para tirá-lo da frente dos funcionários sem apagar a prova de leitura.",
    };
  }

  await db.documento.delete({ where: { id } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_DOCUMENTO",
    targetType: "Documento",
    targetId: id,
    details: documento.titulo,
  });

  revalidatePath("/admin/documentos");
  return { ok: true, message: "Documento excluído." };
}

/**
 * "Li e concordo".
 *
 * A versão aceita é a que está NO AR neste instante, lida do banco — nunca a
 * que a tela mandou. Se a política for revisada entre a página carregar e a
 * pessoa clicar, o aceite tem de valer para o texto que ela realmente viu, e a
 * releitura aqui é o que garante que a plataforma não registre concordância
 * com um documento que ninguém abriu.
 */
export async function registrarAceite(documentoId: string): Promise<ActionResult> {
  const usuario = await requireUser();

  const documento = await db.documento.findUnique({
    where: { id: documentoId },
    select: {
      titulo: true,
      versao: true,
      publicado: true,
      departamentos: { select: { departmentId: true } },
    },
  });
  if (!documento) return { ok: false, error: "Documento não encontrado." };
  if (!documento.publicado) return { ok: false, error: "Este documento não está disponível." };

  /*
    Alcance conferido no servidor, e não só na listagem: a tela é conveniência,
    a action é a fronteira. Sem isto, bastaria conhecer o id para "aceitar" a
    política de outro setor e sujar o relatório dele.
  */
  const setores = await departamentosDaPessoa(usuario.id);
  const alcanca = documentoAlcanca(
    documento.departamentos.map((d) => d.departmentId),
    setores
  );
  if (!alcanca) return { ok: false, error: "Este documento não se aplica a você." };

  const cabecalhos = await headers();
  const ip = ipDaRequisicao(Object.fromEntries(cabecalhos.entries()));

  /*
    Idempotente: clicar duas vezes, ou dois cliques do mesmo dedo no celular,
    não devem gerar dois registros nem um erro na cara de quem já aceitou.
  */
  await db.aceiteDeDocumento.upsert({
    where: {
      userId_documentoId_versao: {
        userId: usuario.id,
        documentoId,
        versao: documento.versao,
      },
    },
    create: { userId: usuario.id, documentoId, versao: documento.versao, ip },
    update: {},
  });

  revalidatePath("/documentos");
  return { ok: true, message: "Aceite registrado. Obrigado." };
}
