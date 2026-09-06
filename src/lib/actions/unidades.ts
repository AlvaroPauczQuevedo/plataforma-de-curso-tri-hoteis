"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { ehProprietario } from "@/lib/alcance-admin";
import type { ActionResult } from "@/lib/actions/employees";

/**
 * As unidades da rede — os hotéis.
 *
 * Espelha o que `createDepartment`/`deleteDepartment` fazem com departamentos,
 * e pelas mesmas razões. A diferença de fundo está no schema: unidade é o
 * LUGAR e departamento é a FUNÇÃO, dimensões separadas para que 25 hotéis
 * vezes 6 setores não virem 150 departamentos.
 */

export async function criarUnidade(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  /*
    Só o proprietário, como nos departamentos.

    Criar unidade é decidir a estrutura da rede, e só ele consegue atribuir
    alguém a uma. Aberto a todos, geraria hotéis órfãos que ninguém usa — e,
    pior, um gerente poderia criar uma unidade para si e ampliar o próprio
    alcance sem passar por ninguém.
  */
  if (!(await ehProprietario(admin.id))) {
    return { ok: false, error: "Só o proprietário da plataforma pode criar unidades." };
  }

  const nome = name?.trim();
  if (!nome) return { ok: false, error: "Informe o nome do hotel." };

  const existente = await db.unidade.findUnique({ where: { name: nome } });
  if (existente) return { ok: false, error: "Já existe uma unidade com este nome." };

  await db.unidade.create({ data: { name: nome } });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_UNIDADE",
    targetType: "Unidade",
    details: nome,
  });

  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/funcionarios");
  return { ok: true, message: `Unidade "${nome}" criada.` };
}

/**
 * Exclui uma unidade vazia.
 *
 * Recusa enquanto houver gente vinculada — apagar assim deixaria funcionários
 * sem lugar e, o que é pior, tiraria do alcance de quem os administra sem
 * nenhum aviso. Esvaziar é decisão de quem administra, feita pessoa a pessoa.
 */
export async function excluirUnidade(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!(await ehProprietario(admin.id))) {
    return { ok: false, error: "Só o proprietário da plataforma pode excluir unidades." };
  }

  const unidade = await db.unidade.findUnique({
    where: { id },
    select: {
      name: true,
      _count: { select: { users: true, membrosExtras: true } },
    },
  });
  if (!unidade) return { ok: false, error: "Unidade não encontrada." };

  const vinculadas = unidade._count.users + unidade._count.membrosExtras;
  if (vinculadas > 0) {
    return {
      ok: false,
      error:
        `"${unidade.name}" tem ${vinculadas} vínculo(s) e não pode ser excluída. ` +
        "Mova essas pessoas para outra unidade antes.",
    };
  }

  await db.unidade.delete({ where: { id } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_UNIDADE",
    targetType: "Unidade",
    details: unidade.name,
  });

  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/funcionarios");
  return { ok: true, message: `Unidade "${unidade.name}" excluída.` };
}
