"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword, senhaProvisoria } from "@/lib/password";
import { logAdminActivity } from "@/lib/activity-log";
import { sincronizarUsuario } from "@/lib/matricula-automatica";
import { motivoDeNomeInvalido, normalizarNomeDeUsuario } from "@/lib/nome-de-usuario";
import {
  executarLoteDeFuncionarios,
  type ResultadoDoLoteDePessoas,
} from "@/lib/cadastro-em-lote";
import { motivoDeTelefoneInvalido, normalizarTelefone } from "@/lib/whatsapp";
import {
  type Recusa,
  bloqueioDeAlteracao,
  bloqueioDeVinculo,
} from "@/lib/alcance-admin";

const employeeSchema = z.object({
  name: z.string().min(2, "Informe o nome completo."),
  username: z.string().min(1, "Informe o nome de usuário."),
  telefone: z.string().optional(),
  unidadeId: z.string().optional(),
  position: z.string().optional(),
  departmentId: z.string().optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

import type { ActionResult } from "@/lib/actions/resultado";

// Reexportado para não quebrar os quatorze arquivos que o importavam daqui.
// O lugar dele agora é `actions/resultado`: é tipo, não ação, e
// quatorze arquivos o importavam daqui como se fosse coisa de funcionário.
export type { ActionResult } from "@/lib/actions/resultado";

/**
 * Normaliza e confere o nome de usuário digitado no formulário.
 *
 * O e-mail saiu do cadastro: a rede não tem caixa corporativa, e o endereço
 * pessoal é a própria pessoa quem informa depois, no perfil, confirmando por
 * link. Aqui o administrador define só o identificador de acesso.
 *
 * A checagem roda no servidor mesmo havendo validação na tela, pela razão de
 * sempre: a tela é uma conveniência, a server action é a fronteira.
 */
function lerNomeDeUsuario(bruto: string): { ok: true; valor: string } | Recusa {
  const username = normalizarNomeDeUsuario(bruto);
  const motivo = motivoDeNomeInvalido(username);
  return motivo ? { ok: false, error: motivo } : { ok: true, valor: username };
}

/**
 * Normaliza e confere o telefone, que é OPCIONAL.
 *
 * Vazio devolve `null` sem reclamar: é o estado de quem ainda não informou, e
 * exigir o número travaria o cadastro de quem não o tem à mão. Preenchido, aí
 * sim é conferido — número errado não dá erro em lugar nenhum, o link só abre
 * uma conversa que não existe.
 */
function lerTelefone(bruto: string | null): { ok: true; valor: string | null } | Recusa {
  if (!bruto?.trim()) return { ok: true, valor: null };

  const telefone = normalizarTelefone(bruto);
  const motivo = motivoDeTelefoneInvalido(telefone);
  return motivo ? { ok: false, error: motivo } : { ok: true, valor: telefone };
}

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
    username: formData.get("username"),
    telefone: formData.get("telefone") || undefined,
    unidadeId: formData.get("unidadeId") || undefined,
    position: formData.get("position") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    role: formData.get("role") || "EMPLOYEE",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const nome = lerNomeDeUsuario(parsed.data.username);
  if (!nome.ok) return nome;

  const tel = lerTelefone(parsed.data.telefone ?? null);
  if (!tel.ok) return tel;

  const vinculo = await bloqueioDeVinculo(
    admin.id,
    parsed.data.departmentId || null
  );
  if (vinculo) return vinculo;

  const existing = await db.user.findUnique({ where: { username: nome.valor } });
  if (existing) {
    // A mensagem mostra a forma NORMALIZADA, e não o que foi digitado: quem
    // tentou cadastrar "Maria Silva" precisa entender que o conflito é com
    // "maria.silva", senão procura na lista pelo texto errado.
    return {
      ok: false,
      error: `Já existe um usuário com o nome "${nome.valor}". Escolha outro — o sobrenome do meio costuma resolver.`,
    };
  }

  const tempPassword = senhaProvisoria();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      username: nome.valor,
      telefone: tel.valor,
      unidadeId: parsed.data.unidadeId || null,
      // Sem e-mail: a rede não tem caixa corporativa, e o endereço pessoal é
      // a própria pessoa quem cadastra no perfil, confirmando por link.
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
    /*
      A senha provisória NÃO entra aqui.

      O histórico é permanente e vai para todo backup; a senha é de uso único
      e já é exibida na tela para quem cadastrou entregar. Gravá-la deixava a
      senha inicial de cada funcionário legível para sempre, muito depois de
      ter deixado de valer. `resetEmployeePassword` já não gravava — a
      diferença entre as duas era descuido, não decisão.
    */
    details: `Funcionário ${user.name} cadastrado.`,
  });

  const recusaExtras = await salvarExtras(
    user.id,
    extrasDoFormulario(formData, parsed.data.departmentId || null),
    admin.id
  );
  if (recusaExtras) return recusaExtras;

  // Já entra matriculado no que for obrigatório em todos os setores dele.
  const matriculas = await sincronizarUsuario(user.id, admin.id);

  /*
    Nenhum e-mail é enviado aqui, e não por falta de configuração: no momento
    do cadastro a conta ainda não TEM endereço, porque quem informa é a própria
    pessoa, depois, no perfil.

    Antes esta linha disparava um envio sempre. Com o e-mail corporativo
    inexistente e um endereço inventado no lugar, cada admissão viraria uma
    mensagem devolvida no dia em que alguém ligasse o SMTP para receber o
    resumo de conformidade — e ninguém ligaria a enxurrada de retorno a uma
    decisão tomada meses antes.

    A entrega é em mãos: a senha provisória aparece na tela, uma vez.
  */
  const sufixo =
    matriculas.criadas > 0
      ? ` Matriculado automaticamente em ${matriculas.criadas} curso(s) obrigatório(s).`
      : "";

  revalidatePath("/admin/funcionarios");
  return {
    ok: true,
    message:
      `Funcionário cadastrado. Usuário: ${nome.valor} — senha provisória: ${tempPassword}. ` +
      `Anote e entregue: esta senha não volta a ser exibida.` +
      sufixo,
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
    username: formData.get("username"),
    telefone: formData.get("telefone") || undefined,
    unidadeId: formData.get("unidadeId") || undefined,
    position: formData.get("position") || undefined,
    departmentId: formData.get("departmentId") || undefined,
    role: formData.get("role") || "EMPLOYEE",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const nome = lerNomeDeUsuario(parsed.data.username);
  if (!nome.ok) return nome;

  const tel = lerTelefone(parsed.data.telefone ?? null);
  if (!tel.ok) return tel;

  const vinculo = await bloqueioDeVinculo(
    admin.id,
    parsed.data.departmentId || null
  );
  if (vinculo) return vinculo;

  const existing = await db.user.findFirst({
    where: { username: nome.valor, NOT: { id: userId } },
  });
  if (existing) {
    return {
      ok: false,
      error: `Já existe outro usuário com o nome "${nome.valor}".`,
    };
  }

  /*
    O e-mail NÃO é tocado por aqui.

    Ele é o canal de recuperação de senha da pessoa, e foi ela quem provou ser
    dona daquela caixa clicando no link. Deixar um administrador reescrever o
    campo daria a qualquer um com acesso ao painel um caminho de uma etapa para
    tomar a conta de outro: aponta o e-mail para si, pede "esqueci minha senha",
    entra. As travas de `alcance-admin` limitam QUEM ele alcança, não impedem
    esse movimento dentro do próprio departamento.
  */
  await db.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      username: nome.valor,
      telefone: tel.valor,
      unidadeId: parsed.data.unidadeId || null,
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
 * Quanto histórico a exclusão de um usuário destruiria, e o que a impede.
 *
 * Existe separada da exclusão porque a tela precisa dos mesmos números para
 * avisar ANTES de perguntar. Confirmação que não diz o tamanho do estrago não
 * é confirmação, é formalidade.
 */
export async function impactoDaExclusao(userId: string) {
  /*
    Exige sessão administrativa mesmo sendo só leitura.

    A função é chamada de um componente de servidor, onde quem chega já passou
    por `requireAdmin` — mas ela mora num arquivo `"use server"`, e isso a
    publica como endpoint: quem souber o identificador da action a alcança de
    fora, com o `userId` que quiser. Sem esta linha, dava para varrer contas
    perguntando quantos certificados e tentativas de prova cada uma tem.

    Foi a única das dez funções deste arquivo que estava sem a trava, e passou
    despercebida justamente por ser leitura.
  */
  await requireAdmin();

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

/**
 * Cadastro de vários funcionários de uma vez, uma pessoa por linha.
 *
 * Esta função é só a FRONTEIRA: confere a sessão e o alcance do administrador,
 * e entrega o trabalho para `executarLoteDeFuncionarios`. A regra mora lá
 * porque ali ela é testável — aqui, só com uma sessão de verdade.
 */
export async function criarFuncionariosEmLote(params: {
  texto: string;
  unidadeId?: string | null;
  departmentId?: string | null;
}): Promise<ResultadoDoLoteDePessoas> {
  const admin = await requireAdmin();

  /*
    Mesma trava do cadastro individual: quem só administra um departamento não
    pode criar gente fora dele. Sem isto o lote viraria a porta dos fundos para
    a regra que o formulário de uma pessoa respeita.
  */
  const vinculo = await bloqueioDeVinculo(admin.id, params.departmentId || null);
  if (vinculo) return vinculo;

  const resultado = await executarLoteDeFuncionarios({ adminId: admin.id, ...params });

  if (resultado.ok) {
    revalidatePath("/admin/funcionarios");
    revalidatePath("/admin/primeiro-acesso");
  }

  return resultado;
}
