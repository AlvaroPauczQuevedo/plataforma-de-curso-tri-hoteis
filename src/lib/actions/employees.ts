"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { randomUUID } from "crypto";
import { emailDeBoasVindas, emailDeRedefinicao, enviarEmail } from "@/lib/email";
import { sincronizarUsuario } from "@/lib/matricula-automatica";
import {
  type Recusa,
  bloqueioDeAlteracao,
  bloqueioDeVinculo,
  ehProprietario,
} from "@/lib/alcance-admin";

const employeeSchema = z.object({
  name: z.string().min(2, "Informe o nome completo."),
  email: z.string().email("E-mail inválido."),
  position: z.string().optional(),
  departmentId: z.string().optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Lê os departamentos adicionais do formulário, já sem o principal e sem
 * repetição.
 *
 * O principal sai da lista de propósito: guardá-lo nos dois lugares criaria
 * duas fontes para a mesma informação, e um dia elas discordariam.
 */
function extrasDoFormulario(formData: FormData, principal: string | null) {
  const marcados = formData.getAll("departamentosExtras").map((d) => String(d));
  return [...new Set(marcados)].filter((id) => id && id !== principal);
}

/**
 * Grava os adicionais, recusando o que o administrador não alcança.
 *
 * Sem esta checagem, bastaria forjar a requisição para se dar alcance a
 * qualquer setor — a trava da tela não vale nada sozinha.
 */
async function salvarExtras(
  userId: string,
  extras: string[],
  atorId: string
): Promise<Recusa | null> {
  for (const departmentId of extras) {
    const recusa = await bloqueioDeVinculo(atorId, departmentId);
    if (recusa) return recusa;
  }

  await db.departamentoExtra.deleteMany({
    where: { userId, departmentId: { notIn: extras.length > 0 ? extras : ["-"] } },
  });

  for (const departmentId of extras) {
    await db.departamentoExtra.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      create: { userId, departmentId },
      update: {},
    });
  }

  return null;
}

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = employeeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    position: formData.get("position") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    role: formData.get("role") || "EMPLOYEE",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const vinculo = await bloqueioDeVinculo(
    admin.id,
    parsed.data.departmentId || null
  );
  if (vinculo) return vinculo;

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
  });
  if (existing) {
    return { ok: false, error: "Já existe um usuário com este e-mail." };
  }

  const tempPassword = randomUUID().slice(0, 10);
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      position: parsed.data.position,
      departmentId: parsed.data.departmentId || null,
      role: parsed.data.role,
      passwordHash,
      // Senha gerada por outra pessoa: vale só até o primeiro acesso.
      mustChangePassword: true,
    },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "CRIAR_FUNCIONARIO",
    targetType: "User",
    targetId: user.id,
    details: `Funcionário ${user.name} cadastrado. Senha temporária: ${tempPassword}`,
  });

  const recusaExtras = await salvarExtras(
    user.id,
    extrasDoFormulario(formData, parsed.data.departmentId || null),
    admin.id
  );
  if (recusaExtras) return recusaExtras;

  // Já entra matriculado no que for obrigatório em todos os setores dele.
  const matriculas = await sincronizarUsuario(user.id, admin.id);

  // O envio é um extra: falhando, o cadastro continua válido e a senha aparece
  // na tela para entrega à mão, exatamente como funcionava antes.
  const envio = await enviarEmail(emailDeBoasVindas(user.name, user.email, tempPassword));

  const sufixo =
    matriculas.criadas > 0
      ? ` Matriculado automaticamente em ${matriculas.criadas} curso(s) obrigatório(s).`
      : "";

  revalidatePath("/admin/funcionarios");
  return {
    ok: true,
    message:
      (envio.enviado
        ? `Funcionário cadastrado e avisado por e-mail. Senha temporária: ${tempPassword}`
        : `Funcionário cadastrado. Senha temporária: ${tempPassword}`) + sufixo,
  };
}

export async function updateEmployee(
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

  const parsed = employeeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    position: formData.get("position") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    role: formData.get("role") || "EMPLOYEE",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const vinculo = await bloqueioDeVinculo(
    admin.id,
    parsed.data.departmentId || null
  );
  if (vinculo) return vinculo;

  const existing = await db.user.findFirst({
    where: { email: parsed.data.email.toLowerCase().trim(), NOT: { id: userId } },
  });
  if (existing) {
    return { ok: false, error: "Já existe outro usuário com este e-mail." };
  }

  await db.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      position: parsed.data.position,
      departmentId: parsed.data.departmentId || null,
      role: parsed.data.role,
    },
  });

  const recusaExtras = await salvarExtras(
    userId,
    extrasDoFormulario(formData, parsed.data.departmentId || null),
    admin.id
  );
  if (recusaExtras) return recusaExtras;

  await logAdminActivity({
    adminId: admin.id,
    action: "EDITAR_FUNCIONARIO",
    targetType: "User",
    targetId: userId,
  });

  /*
    Mudou de departamento, entra no que é obrigatório no novo. O que era
    obrigatório no antigo continua matriculado de propósito: pode haver
    progresso e certificado já emitidos, e desmatricular apagaria os dois.
  */
  const matriculas = await sincronizarUsuario(userId, admin.id);

  revalidatePath("/admin/funcionarios");
  revalidatePath(`/admin/funcionarios/${userId}`);
  return {
    ok: true,
    message:
      matriculas.criadas > 0
        ? `Funcionário atualizado. Matriculado em ${matriculas.criadas} curso(s) obrigatório(s) do novo departamento.`
        : "Funcionário atualizado com sucesso.",
  };
}

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

  const tempPassword = randomUUID().slice(0, 10);
  const passwordHash = await hashPassword(tempPassword);

  const alvo = await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "REDEFINIR_SENHA",
    targetType: "User",
    targetId: userId,
  });

  const envio = await enviarEmail(emailDeBoasVindas(alvo.name, alvo.email, tempPassword));

  revalidatePath(`/admin/funcionarios/${userId}`);
  return {
    ok: true,
    message: envio.enviado
      ? `Nova senha enviada por e-mail para ${alvo.email}. Senha: ${tempPassword}`
      : `Nova senha temporária: ${tempPassword}`,
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

  const token = randomUUID();
  await db.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await logAdminActivity({
    adminId: admin.id,
    action: "GERAR_LINK_REDEFINICAO",
    targetType: "User",
    targetId: userId,
    details: target.name,
  });

  const envio = await enviarEmail(emailDeRedefinicao(target.name, target.email, token));

  return {
    ok: true,
    message: envio.enviado
      ? `Link enviado para ${target.email}. Válido por 1 hora e de uso único.`
      : "Link válido por 1 hora e de uso único.",
    resetLink: `/redefinir-senha/${token}`,
  };
}

/**
 * Quanto histórico a exclusão de um usuário destruiria, e o que a impede.
 *
 * Existe separada da exclusão porque a tela precisa dos mesmos números para
 * avisar ANTES de perguntar. Confirmação que não diz o tamanho do estrago não
 * é confirmação, é formalidade.
 */
export async function impactoDaExclusao(userId: string) {
  const [
    matriculas,
    certificados,
    tentativas,
    atividades,
    cursosCriados,
    provasCriadas,
    arquivos,
    matriculasAtribuidas,
  ] = await Promise.all([
    db.enrollment.count({ where: { userId } }),
    db.certificate.count({ where: { userId } }),
    db.tentativaProva.count({ where: { userId } }),
    db.adminActivityLog.count({ where: { adminId: userId } }),
    db.course.count({ where: { createdById: userId } }),
    db.prova.count({ where: { createdById: userId } }),
    db.fileAsset.count({ where: { uploadedById: userId } }),
    db.enrollment.count({ where: { assignedById: userId } }),
  ]);

  /*
    Autoria é relação de restrição no banco: curso, prova, arquivo e matrícula
    atribuída apontam para quem os criou e impedem a exclusão. Sem esta
    contagem o usuário receberia um erro de chave estrangeira em vez de uma
    explicação.
  */
  const autoria = cursosCriados + provasCriadas + arquivos + matriculasAtribuidas;

  return {
    matriculas,
    certificados,
    tentativas,
    atividades,
    cursosCriados,
    provasCriadas,
    arquivos,
    matriculasAtribuidas,
    autoria,
    /** Some em cascata junto com a conta. */
    historico: matriculas + certificados + tentativas + atividades,
  };
}

/**
 * Exclui um usuário definitivamente.
 *
 * Desativar continua sendo o caminho recomendado, e a tela diz isso — mas
 * excluir precisa existir para o caso legítimo: conta criada por engano, com
 * e-mail errado, que nunca deveria ter entrado no cadastro.
 *
 * A exclusão recusa quando a pessoa é AUTORA de conteúdo. Não é preciosismo:
 * curso, prova, arquivo e matrícula atribuída guardam quem os criou, e apagar
 * a conta arrancaria a autoria de material que continua no ar. Nesses casos o
 * caminho é desativar.
 */
export async function deleteEmployee(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (userId === admin.id) {
    return { ok: false, error: "Você não pode excluir a própria conta." };
  }

  // Mesmo alcance da edição: departamento próprio, e nunca conta protegida.
  const bloqueio = await bloqueioDeAlteracao(userId, admin.id);
  if (bloqueio) return bloqueio;

  const alvo = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };

  const impacto = await impactoDaExclusao(userId);

  if (impacto.autoria > 0) {
    const partes: string[] = [];
    if (impacto.cursosCriados > 0) partes.push(`${impacto.cursosCriados} curso(s)`);
    if (impacto.provasCriadas > 0) partes.push(`${impacto.provasCriadas} prova(s)`);
    if (impacto.arquivos > 0) partes.push(`${impacto.arquivos} arquivo(s)`);
    if (impacto.matriculasAtribuidas > 0) {
      partes.push(`${impacto.matriculasAtribuidas} matrícula(s) atribuída(s)`);
    }

    return {
      ok: false,
      error:
        `${alvo.name} é autor(a) de ${partes.join(", ")}. Excluir a conta arrancaria ` +
        "a autoria desse conteúdo, que continua no ar. Desative o acesso — o " +
        "histórico fica preservado e a pessoa não entra mais.",
    };
  }

  await db.user.delete({ where: { id: userId } });

  await logAdminActivity({
    adminId: admin.id,
    action: "EXCLUIR_USUARIO",
    targetType: "User",
    targetId: userId,
    details: alvo.name,
  });

  revalidatePath("/admin/funcionarios");
  return { ok: true, message: `Conta de ${alvo.name} excluída.` };
}

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
