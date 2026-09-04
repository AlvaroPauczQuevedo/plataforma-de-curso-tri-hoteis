"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { emailDeConfirmacaoDeEndereco, enviarEmail, envioDisponivel } from "@/lib/email";
import type { ActionResult } from "@/lib/actions/employees";

/**
 * Cadastro do e-mail PESSOAL, feito pela própria pessoa.
 *
 * A rede não tem e-mail corporativo, e o login é um nome de usuário. Este
 * endereço não é dado de contato: é o único caminho pelo qual alguém recupera
 * a própria senha sem depender do RH. Quem controla aquela caixa controla o
 * acesso à conta — e é isso que decide todo o desenho abaixo.
 *
 * Daí a confirmação por link. O endereço fica em `EmailConfirmacao` até o
 * clique e só então chega em `User.email`: nunca existe endereço por confirmar
 * no cadastro. Um dígito errado — "gmial.com", ou a caixa de um estranho —
 * poria a chave da conta de um funcionário na mão de terceiro, que poderia
 * pedir redefinição quando quisesse. O que está em jogo são os certificados de
 * treinamento obrigatório.
 */

const VALIDADE_HORAS = 24;
/** Intervalo mínimo entre dois pedidos, para o formulário não virar arma. */
const INTERVALO_MINUTOS = 2;

const esquema = z.object({
  email: z.string().trim().toLowerCase().email("Endereço de e-mail inválido."),
});

export async function solicitarConfirmacaoDeEmail(formData: FormData): Promise<ActionResult> {
  const sessao = await requireUser();

  const parsed = esquema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const endereco = parsed.data.email;

  /*
    Sem SMTP não há como confirmar nada, e gravar o endereço assim mesmo seria
    exatamente o atalho que este fluxo existe para não tomar. Melhor dizer que
    o recurso está desligado do que aceitar um endereço não verificado.
  */
  if (!envioDisponivel()) {
    return {
      ok: false,
      error:
        "O envio de e-mail não está configurado nesta instalação, então não há como confirmar o endereço. Procure o RH para redefinir sua senha quando precisar.",
    };
  }

  const usuario = await db.user.findUniqueOrThrow({ where: { id: sessao.id } });
  if (usuario.email === endereco) {
    return { ok: false, error: "Este endereço já está confirmado na sua conta." };
  }

  /*
    Duas pessoas não podem registrar a mesma caixa: quem a lê pediria
    redefinição para a conta da outra e entraria nela. O caso real é o e-mail
    compartilhado entre marido e mulher, os dois funcionários da rede — e é
    melhor que apareça aqui, como recusa clara, do que como um acesso indevido
    daqui a seis meses.
  */
  const jaUsado = await db.user.findFirst({
    where: { email: endereco, NOT: { id: usuario.id } },
    select: { id: true },
  });
  if (jaUsado) {
    return {
      ok: false,
      error:
        "Este endereço já está em uso por outra conta. Cada pessoa precisa de uma caixa própria — é por ela que a senha é recuperada.",
    };
  }

  // Trava simples de repetição: sem ela, este formulário despacha uma mensagem
  // por clique para qualquer endereço digitado, à custa do domínio da rede.
  const recente = await db.emailConfirmacao.findFirst({
    where: {
      userId: usuario.id,
      createdAt: { gt: new Date(Date.now() - INTERVALO_MINUTOS * 60_000) },
    },
  });
  if (recente) {
    return {
      ok: false,
      error: `Já enviamos um link há pouco. Espere ${INTERVALO_MINUTOS} minutos antes de pedir outro, e confira a caixa de spam.`,
    };
  }

  // Um pedido novo invalida os anteriores: sem isto, cada tentativa deixaria
  // mais um link capaz de gravar um endereço diferente, todos válidos ao mesmo
  // tempo — e o último clicado venceria, que não é necessariamente o último
  // pedido.
  await db.emailConfirmacao.updateMany({
    where: { userId: usuario.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomUUID();
  await db.emailConfirmacao.create({
    data: {
      userId: usuario.id,
      email: endereco,
      token,
      expiresAt: new Date(Date.now() + VALIDADE_HORAS * 3_600_000),
    },
  });

  const envio = await enviarEmail(emailDeConfirmacaoDeEndereco(usuario.name, endereco, token));
  if (!envio.enviado) {
    // Queima o token: um link que não chegou a ninguém não deve continuar
    // valendo por 24 horas.
    await db.emailConfirmacao.update({ where: { token }, data: { usedAt: new Date() } });
    return {
      ok: false,
      error: "Não foi possível enviar a mensagem agora. Tente de novo em alguns minutos.",
    };
  }

  revalidatePath("/perfil");
  return {
    ok: true,
    message: `Enviamos um link para ${endereco}. Ele vale por ${VALIDADE_HORAS} horas — confira também a caixa de spam. O endereço só passa a valer depois que você clicar.`,
  };
}

/**
 * Consome o link e grava o endereço.
 *
 * Não exige sessão: o token é a prova, e quem clica costuma estar no celular,
 * fora da plataforma. Exigir login aqui só adicionaria um obstáculo entre a
 * pessoa e a única coisa que ela pode fazer sozinha para recuperar a conta.
 */
export async function confirmarEmail(token: string): Promise<ActionResult> {
  const pedido = await db.emailConfirmacao.findUnique({ where: { token } });

  if (!pedido || pedido.usedAt || pedido.expiresAt < new Date()) {
    return {
      ok: false,
      error: "Este link não vale mais. Peça outro na tela de perfil, em Meu e-mail.",
    };
  }

  // Confere de novo na hora de gravar: entre o pedido e o clique, outra pessoa
  // pode ter confirmado o mesmo endereço.
  const jaUsado = await db.user.findFirst({
    where: { email: pedido.email, NOT: { id: pedido.userId } },
    select: { id: true },
  });
  if (jaUsado) {
    await db.emailConfirmacao.update({ where: { token }, data: { usedAt: new Date() } });
    return { ok: false, error: "Este endereço já está em uso por outra conta." };
  }

  await db.user.update({ where: { id: pedido.userId }, data: { email: pedido.email } });
  await db.emailConfirmacao.update({ where: { token }, data: { usedAt: new Date() } });

  /*
    Sem `revalidatePath` aqui, ao contrário das outras duas ações deste arquivo.

    Esta roda a partir do link do e-mail, onde quem clica normalmente não tem
    sessão aberta — e `revalidatePath` exige o contexto de requisição do Next,
    que naquele caminho pode não existir. Não custa nada: `/perfil` depende da
    sessão, portanto é dinâmica e relida a cada acesso de qualquer forma.
  */
  return {
    ok: true,
    message: `Pronto. ${pedido.email} está confirmado e passa a receber o link quando você esquecer a senha.`,
  };
}

/**
 * Desfaz o vínculo.
 *
 * Existe para quem perdeu o acesso à própria caixa — que acontece, e sem isto
 * a pessoa ficaria com um canal de recuperação apontando para um lugar que ela
 * não lê mais, e que talvez outra pessoa leia.
 */
export async function removerEmail(): Promise<ActionResult> {
  const sessao = await requireUser();

  await db.user.update({ where: { id: sessao.id }, data: { email: null } });
  await db.emailConfirmacao.updateMany({
    where: { userId: sessao.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  revalidatePath("/perfil");
  return {
    ok: true,
    message:
      "Endereço removido. Enquanto não houver outro, só o RH pode redefinir a sua senha.",
  };
}
