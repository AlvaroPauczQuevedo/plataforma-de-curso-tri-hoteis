"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { ActionResult } from "@/lib/actions/employees";
import { emailDeRedefinicao, enviarEmail, envioDisponivel } from "@/lib/email";
import { consumirVagaCompartilhada } from "@/lib/teto-compartilhado";

/**
 * Resposta idêntica exista ou não o e-mail, para não revelar a base.
 *
 * O texto muda conforme haja SMTP configurado, mas nunca conforme o e-mail
 * exista — senão a própria diferença de mensagem revelaria quem é cadastrado.
 */
const MENSAGEM_COM_EMAIL =
  "Se este e-mail estiver cadastrado, o link de redefinição foi enviado para ele. " +
  "O link vale por 1 hora. Confira também a caixa de spam.";

const MENSAGEM_SEM_EMAIL =
  "Se este e-mail estiver cadastrado, a solicitação foi registrada. " +
  "Procure o administrador do treinamento para receber o link de redefinição.";

/**
 * Teto de pedidos, por conta e no total, numa janela de uma hora.
 *
 * Esta era a única porta pública da plataforma sem limite nenhum. O login tem
 * duas barreiras (por conta e por origem); aqui, um laço de requisições com o
 * e-mail de um funcionário enchia a caixa dele e queimava a cota de SMTP, sem
 * precisar acertar senha nenhuma.
 *
 * O contador NÃO conta linhas de `PasswordResetToken`, que seria o caminho
 * óbvio: aquela tabela também recebe os links que o administrador gera pelo
 * painel, e três links legítimos deixariam a pessoa sem conseguir se virar
 * sozinha por uma hora. O teto compartilhado é independente da tabela e
 * enxerga todos os processos do servidor.
 *
 * O teto GLOBAL é o que limita a conta de SMTP, e ele tem um custo que vale
 * dizer: quem quiser pode gastá-lo e deixar a redefinição indisponível até a
 * janela virar. Isso é aceitável aqui porque existe a saída pelo painel — o
 * administrador gera o link direto, sem passar por esta porta — e porque nesta
 * rede a maioria das contas nem tem e-mail para receber. Por isso ele é
 * folgado: serve para conter enxurrada, não para racionar uso normal.
 */
const JANELA_DE_PEDIDOS_MS = 60 * 60_000;
const TETO_POR_CONTA = Number(process.env.REDEFINICAO_TETO_POR_CONTA ?? 3);
const TETO_GLOBAL = Number(process.env.REDEFINICAO_TETO_GLOBAL ?? 60);

/** Falso quando esta conta, ou a plataforma toda, já estourou a janela. */
function cabeNoTeto(userId: string): boolean {
  /*
    A conta é conferida ANTES do global, e as duas contam sempre — nem uma nem
    outra sai na frente com o resultado da outra. Somar ao contador global só
    quando o da conta passa faria uma enxurrada contra uma conta só nunca
    aparecer no total.
  */
  const daConta = consumirVagaCompartilhada({
    arquivo: "pedidos-de-redefinicao.json",
    chave: userId,
    teto: TETO_POR_CONTA,
    duracaoMs: JANELA_DE_PEDIDOS_MS,
  });

  const doTotal = consumirVagaCompartilhada({
    arquivo: "pedidos-de-redefinicao.json",
    chave: "global",
    teto: TETO_GLOBAL,
    duracaoMs: JANELA_DE_PEDIDOS_MS,
  });

  return daConta && doTotal;
}

/**
 * Registra um pedido de redefinição de senha.
 *
 * O link NUNCA é devolvido para quem preencheu o formulário: como esta tela é
 * pública, devolvê-lo permitiria que qualquer pessoa que soubesse o e-mail de
 * um funcionário assumisse a conta dele. Ele só sai por e-mail, para o próprio
 * endereço da conta — quem não tem acesso à caixa não recebe nada.
 *
 * Sem SMTP configurado, o token continua sendo gravado e o administrador o
 * entrega pelo painel (ver generatePasswordResetLink).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { ok: false, error: "Informe um e-mail válido." };
  }

  const mensagem = envioDisponivel() ? MENSAGEM_COM_EMAIL : MENSAGEM_SEM_EMAIL;

  const endereco = email.data.toLowerCase().trim();

  // Busca pelo endereço, não pelo login: quem esqueceu a senha costuma
  // lembrar da própria caixa. Contas sem e-mail — a maioria desta rede — não
  // são alcançáveis por aqui de propósito, e a tela avisa isso antes.
  const user = await db.user.findUnique({ where: { email: endereco } });

  // Não revelamos se o e-mail existe ou não, por segurança.
  if (!user || !user.active) {
    return { ok: true, message: mensagem };
  }

  /*
    Estourado o teto, sai daqui a MESMA resposta de sempre.

    Nada de "muitos pedidos": a mensagem é a única coisa que quem está do outro
    lado enxerga, e uma resposta diferente entregaria de graça o que o texto
    genérico existe para esconder — que aquele endereço está cadastrado.

    O pedido é descartado inteiro, e não só o envio. O link anterior, se ainda
    valer, continua valendo: invalidá-lo aqui deixaria quem pediu de boa-fé sem
    o link que já recebeu, que é exatamente o estrago que o atacante queria.
  */
  if (!cabeNoTeto(user.id)) {
    return { ok: true, message: mensagem };
  }

  // Invalida pedidos anteriores ainda pendentes: sem isto, cada tentativa
  // deixaria mais um link válido circulando por uma hora.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await db.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  await enviarEmail(emailDeRedefinicao(user.name, endereco, token));

  return { ok: true, message: mensagem };
}

const resetSchema = z
  .object({
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export async function resetPassword(token: string, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const resetToken = await db.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { ok: false, error: "Este link de redefinição é inválido ou expirou." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await db.$transaction([
    /*
      A pessoa escolheu a própria senha: a exigência de troca deixa de fazer
      sentido, senão o primeiro acesso pediria a troca de novo.

      O contador de tentativas zera junto. O bloqueio por tentativas seguidas
      é conferido antes da comparação da senha (lib/login-guard), então sem
      isto quem foi bloqueado e redefiniu a senha continuava barrado por até
      quinze minutos, com a senha certa em mãos e nenhuma explicação na tela.
    */
    db.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
      },
    }),
    db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  return { ok: true, message: "Senha redefinida com sucesso. Você já pode entrar." };
}
