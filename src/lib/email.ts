/**
 * Envio de e-mail — opcional.
 *
 * A plataforma funciona sem SMTP configurado, exatamente como funcionava antes
 * deste módulo existir: o administrador entrega a senha ou o link à mão. Com
 * SMTP configurado, os mesmos fluxos passam a avisar a pessoa direto.
 *
 * Essa escolha é deliberada. Um envio obrigatório transformaria uma
 * configuração ausente em falha de cadastro — o funcionário não seria criado
 * porque o e-mail não saiu. Aqui o cadastro sempre acontece; o e-mail é um
 * extra que informa quando pode.
 *
 * Variáveis (todas necessárias para ligar):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Opcional:
 *   SMTP_SECURE=true   força TLS na conexão (porta 465). Padrão: true se 465.
 */
import type { Transporter } from "nodemailer";

export type ResultadoEnvio =
  | { enviado: true }
  | { enviado: false; motivo: "sem-configuracao" | "falha"; detalhe?: string };

function configurado(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
  );
}

/** `true` quando há SMTP configurado — usado pela interface para ajustar o texto. */
export function envioDisponivel(): boolean {
  return configurado();
}

let transporte: Transporter | null = null;

/**
 * O nodemailer é carregado só quando há SMTP configurado.
 *
 * Import estático arrastaria a biblioteca para todo build, inclusive nas
 * instalações que nunca vão enviar e-mail.
 */
async function obterTransporte(): Promise<Transporter> {
  if (transporte) return transporte;

  const { createTransport } = await import("nodemailer");
  const porta = Number(process.env.SMTP_PORT);

  transporte = createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : porta === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });

  return transporte;
}

/** Base para montar links absolutos nos e-mails. */
export function enderecoPublico(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

type Mensagem = {
  para: string;
  assunto: string;
  /** Corpo em texto puro. O HTML é derivado dele, para não manter duas versões. */
  texto: string;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * Corpo em HTML a partir do texto puro.
 *
 * Exportada para teste: o nome da pessoa vem do cadastro, digitado por outra
 * pessoa, e sem escape entraria cru no HTML do e-mail.
 */
export function paraHtml(texto: string): string {
  const escapado = texto.replace(/[&<>"]/g, (c) => ESCAPES[c]);
  const corpo = escapado
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px">${p.split("\n").join("<br>")}</p>`)
    .join("");

  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;',
    'font-size:15px;line-height:1.6;color:#0F172A;max-width:560px">',
    corpo,
    '<p style="margin:24px 0 0;font-size:13px;color:#64748B">',
    "Academia Corporativa Tri Hotéis</p></div>",
  ].join("");
}

/**
 * Envia um e-mail. Nunca lança.
 *
 * Quem chama está no meio de uma operação que já deu certo — o funcionário foi
 * cadastrado, o link foi gerado. Uma exceção aqui desfaria a impressão de
 * sucesso de algo que realmente aconteceu, então a falha volta como valor e o
 * chamador decide o que dizer.
 */
export async function enviarEmail(mensagem: Mensagem): Promise<ResultadoEnvio> {
  if (!configurado()) return { enviado: false, motivo: "sem-configuracao" };

  try {
    const transporte = await obterTransporte();
    await transporte.sendMail({
      from: process.env.SMTP_FROM,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      html: paraHtml(mensagem.texto),
    });
    return { enviado: true };
  } catch (erro) {
    console.error("[email] falha ao enviar:", erro);
    return { enviado: false, motivo: "falha", detalhe: (erro as Error).message };
  }
}

// ---------- Mensagens da plataforma ----------

export function emailDeBoasVindas(nome: string, email: string, senha: string): Mensagem {
  const primeiroNome = nome.split(" ")[0];
  return {
    para: email,
    assunto: "Seu acesso à Academia Corporativa Tri Hotéis",
    texto: [
      `Olá, ${primeiroNome}.`,
      "Seu acesso à Academia Corporativa foi criado. Entre com:",
      `Endereço: ${enderecoPublico()}\nE-mail: ${email}\nSenha provisória: ${senha}`,
      "A plataforma vai pedir uma nova senha no primeiro acesso. Esta senha provisória deixa de valer nesse momento.",
      "Se você não esperava este e-mail, avise o RH.",
    ].join("\n\n"),
  };
}

/**
 * O resumo semanal de conformidade.
 *
 * Existe porque a tela `/admin/conformidade` responde a pergunta certa e
 * depende de alguém LEMBRAR de abri-la. Treinamento obrigatório vencido é
 * exatamente o tipo de coisa que ninguém descobre até a auditoria perguntar.
 *
 * Só sai quando há o que cobrar: sem atraso nem vencimento próximo, não há
 * e-mail. Um resumo semanal que chega dizendo "está tudo bem" é o que ensina
 * quem recebe a arquivá-lo sem ler — e aí o da semana que importa vai junto.
 * Quem quiser a foto completa abre a tela, que mostra também quem está em dia.
 */
export function emailDeConformidade(dados: {
  atrasados: number;
  vencendo: number;
  porSetor: { departamento: string; atrasado: number; vencendo: number }[];
}): Mensagem | null {
  if (dados.atrasados === 0 && dados.vencendo === 0) return null;

  const linhas = dados.porSetor.map(
    (s) => `${s.departamento}: ${s.atrasado} atrasado(s), ${s.vencendo} vencendo`
  );

  const assunto =
    dados.atrasados > 0
      ? `${dados.atrasados} treinamento(s) obrigatório(s) em atraso`
      : `${dados.vencendo} treinamento(s) obrigatório(s) vencendo`;

  const paragrafos = [
    "Resumo dos treinamentos obrigatórios da Academia Corporativa.",
    [`Em atraso: ${dados.atrasados}`, `Vencendo em até 7 dias: ${dados.vencendo}`].join("\n"),
    linhas.length > 0 ? ["Por setor:", ...linhas].join("\n") : "",
    `Nome a nome, com prazo e progresso: ${enderecoPublico()}/admin/conformidade`,
  ].filter(Boolean);

  return {
    // Quem chama preenche o destinatário: a mensagem não decide para quem vai.
    para: "",
    assunto: `[Academia] ${assunto}`,
    texto: paragrafos.join("\n\n"),
  };
}

export function emailDeRedefinicao(nome: string, email: string, token: string): Mensagem {
  const primeiroNome = nome.split(" ")[0];
  return {
    para: email,
    assunto: "Redefinição de senha — Academia Corporativa",
    texto: [
      `Olá, ${primeiroNome}.`,
      "Recebemos um pedido para redefinir a senha da sua conta. Use o link abaixo:",
      `${enderecoPublico()}/redefinir-senha/${token}`,
      "O link vale por 1 hora e só pode ser usado uma vez.",
      "Se não foi você quem pediu, ignore este e-mail — sua senha atual continua valendo.",
    ].join("\n\n"),
  };
}
