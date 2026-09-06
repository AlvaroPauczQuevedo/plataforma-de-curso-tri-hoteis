"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { ehProprietario } from "@/lib/alcance-admin";
import {
  MAXIMO_DO_LOTE,
  chaveDeComparacao,
  nomesDoLote,
} from "@/lib/lote-de-unidades";
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

export type ResultadoDoLote =
  | { ok: false; error: string }
  | { ok: true; criadas: string[]; jaExistiam: string[] };

/**
 * Cadastra vários hotéis de uma vez, um nome por linha.
 *
 * Existe porque cadastrar a rede inteira pelo formulário simples são 25 vezes
 * a mesma digitação, e a hospedagem não dá terminal para fazer isso por script.
 *
 * REPETIDO NÃO É ERRO: nome que já existe é apenas informado, e o resto do lote
 * segue. Assim dá para colar a lista inteira de novo depois de acrescentar um
 * hotel, sem precisar separar o que já foi do que falta — que é exatamente como
 * um cadastro feito aos poucos acontece na prática.
 */
export async function criarUnidadesEmLote(texto: string): Promise<ResultadoDoLote> {
  const admin = await requireAdmin();

  if (!(await ehProprietario(admin.id))) {
    return { ok: false, error: "Só o proprietário da plataforma pode criar unidades." };
  }

  const nomes = nomesDoLote(texto);

  if (nomes.length === 0) {
    return { ok: false, error: "Cole ao menos um nome de hotel, um por linha." };
  }
  if (nomes.length > MAXIMO_DO_LOTE) {
    return {
      ok: false,
      error: `São ${nomes.length} nomes e o limite é ${MAXIMO_DO_LOTE} por vez. Confira se não colou a planilha inteira.`,
    };
  }

  /*
    Compara pela MESMA chave que remove duplicata dentro do texto. Usar aqui um
    critério mais frouxo — comparar o nome cru, por exemplo — deixaria passar
    justamente o que a leitura acabou de barrar: o hotel já cadastrado com
    acento entraria de novo sem ele.
  */
  const existentes = new Set(
    (await db.unidade.findMany({ select: { name: true } })).map((u) =>
      chaveDeComparacao(u.name)
    )
  );

  const criar = nomes.filter((n) => !existentes.has(chaveDeComparacao(n)));
  const jaExistiam = nomes.filter((n) => existentes.has(chaveDeComparacao(n)));

  if (criar.length > 0) {
    await db.unidade.createMany({ data: criar.map((name) => ({ name })) });

    /*
      Um registro para o lote, e não um por hotel: o que interessa na auditoria
      é "fulano cadastrou a rede em tal momento". Vinte e cinco linhas iguais
      afogariam o histórico e esconderiam o resto do que aconteceu no dia.
    */
    await logAdminActivity({
      adminId: admin.id,
      action: "CRIAR_UNIDADES_EM_LOTE",
      targetType: "Unidade",
      details: `${criar.length}: ${criar.join(", ")}`.slice(0, 1000),
    });

    revalidatePath("/admin/configuracoes");
    revalidatePath("/admin/funcionarios");
  }

  return { ok: true, criadas: criar, jaExistiam };
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
