"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdminActivity } from "@/lib/activity-log";
import { ehProprietario } from "@/lib/alcance-admin";
import type { ActionResult } from "@/lib/actions/resultado";

/**
 * Criar e excluir departamento.
 *
 * Vivia dentro de `actions/employees`, e não por parentesco: departamento não
 * é funcionário. Estava ali porque a tela de configurações e a de pessoas
 * nasceram juntas. O departamento governa o alcance de administrador, de
 * curso, de prova, de documento e de trilha — a plataforma inteira se apoia
 * nele, e ele merecia deixar de ser um apêndice do cadastro de gente.
 */

export async function createDepartment(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  // Criar departamento é decidir a estrutura da plataforma, e só o proprietário
  // consegue atribuir alguém a um. Aberto a todos, geraria só departamentos
  // órfãos que ninguém pode usar.
  if (!(await ehProprietario(admin.id))) {
    return {
      ok: false,
      error: "Só o proprietário da plataforma pode criar departamentos.",
    };
  }

  if (!name?.trim()) return { ok: false, error: "Informe o nome do departamento." };

  const existing = await db.department.findUnique({ where: { name: name.trim() } });
  if (existing) return { ok: false, error: "Departamento já existe." };

  await db.department.create({ data: { name: name.trim() } });
  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_DEPARTAMENTO",
    targetType: "Department",
    details: name,
  });

  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

/**
 * Exclui um departamento — só o proprietário, e só quando não sobra nada preso
 * a ele.
 *
 * A recusa é a parte importante desta função. Departamento é a peça que amarra
 * três coisas, e cada uma quebra de um jeito diferente se ele sumir:
 *
 *  - USUÁRIOS ficariam sem setor. Sem setor, nenhum treinamento obrigatório os
 *    alcança e nenhum administrador de departamento consegue editá-los. A
 *    pessoa continua na plataforma, invisível para as regras.
 *
 *  - CURSOS ficariam sem dono. Curso sem departamento é editável apenas pelo
 *    proprietário — na prática, o conteúdo do setor extinto ficaria congelado
 *    para todos os outros administradores.
 *
 *  - REGRAS DE TREINAMENTO OBRIGATÓRIO seriam apagadas em cascata, em silêncio.
 *    As matrículas já criadas sobrevivem, mas a regra que as gerava some — e
 *    ninguém mais entra automaticamente. É a perda mais cara das três, porque
 *    só aparece meses depois, quando alguém nota que a equipe nova não recebeu
 *    o treinamento.
 *
 * Por isso a função conta antes e explica o que encontrou, em vez de apagar e
 * deixar o rastro para alguém descobrir depois.
 */
export async function deleteDepartment(departmentId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!(await ehProprietario(admin.id))) {
    return {
      ok: false,
      error: "Só o proprietário da plataforma pode excluir departamentos.",
    };
  }

  const departamento = await db.department.findUnique({
    where: { id: departmentId },
    select: {
      name: true,
      _count: { select: { users: true, courses: true, obrigatorios: true } },
    },
  });

  if (!departamento) return { ok: false, error: "Departamento não encontrado." };

  const { users, courses, obrigatorios } = departamento._count;

  /*
    As pendências são listadas juntas, e não uma por vez: quem precisa esvaziar
    um departamento quer saber tudo o que falta de uma vez, não descobrir o
    próximo impedimento a cada tentativa.
  */
  const pendencias: string[] = [];
  if (users > 0) pendencias.push(`${users} usuário(s)`);
  if (courses > 0) pendencias.push(`${courses} curso(s)`);
  if (obrigatorios > 0) pendencias.push(`${obrigatorios} regra(s) de treinamento obrigatório`);

  if (pendencias.length > 0) {
    return {
      ok: false,
      error:
        `Não é possível excluir "${departamento.name}": ainda há ` +
        `${pendencias.join(", ")} vinculado(s) a ele. ` +
        "Mova ou remova esses vínculos antes de excluir.",
    };
  }

  await db.department.delete({ where: { id: departmentId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_DEPARTAMENTO",
    targetType: "Department",
    targetId: departmentId,
    details: departamento.name,
  });

  revalidatePath("/admin/funcionarios");
  revalidatePath("/admin/configuracoes");
  return { ok: true, message: `Departamento "${departamento.name}" excluído.` };
}
