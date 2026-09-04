import { db } from "@/lib/db";

/**
 * Proteção contra adivinhação de senha.
 *
 * Duas barreiras independentes, porque atacam problemas diferentes:
 *
 *  - **por conta**: N erros seguidos travam aquele login por alguns minutos.
 *    Impede insistir numa conta específica, tipicamente a de um administrador.
 *  - **por origem**: teto de tentativas por IP numa janela curta. Impede
 *    varrer muitas contas com poucas tentativas em cada, que passaria
 *    despercebido pela primeira barreira.
 *
 * O contador da conta zera a cada acerto — quem erra a senha, corrige e entra
 * não acumula bloqueio ao longo do dia.
 */

const MAX_TENTATIVAS = Number(process.env.MAX_FAILED_ATTEMPTS ?? 5);
const MINUTOS_BLOQUEIO = Number(process.env.LOCKOUT_MINUTES ?? 15);
const TETO_POR_IP = Number(process.env.LOGIN_IP_LIMIT ?? 30);
const JANELA_IP_MINUTOS = Number(process.env.LOGIN_IP_WINDOW_MINUTES ?? 5);
/** Tentativas mais antigas que isto não servem mais nem para auditoria curta. */
const RETENCAO_HORAS = 24;

export class LoginBloqueado extends Error {}

/**
 * IP de origem da requisição.
 *
 * `x-forwarded-for` só é lido com TRUST_PROXY ligado. O cabeçalho é escrito
 * pelo cliente: sem um proxy de verdade na frente, qualquer um o forja e
 * escolhe o próprio balde de limite, tornando a barreira por origem inútil.
 */
export function ipDaRequisicao(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  if (process.env.TRUST_PROXY === "true") {
    const encaminhado = headers["x-forwarded-for"];
    if (encaminhado) return encaminhado.split(",")[0]!.trim();
  }
  return headers["x-real-ip"] ?? "";
}

/**
 * Verifica se a tentativa pode prosseguir. Lança `LoginBloqueado` com a
 * mensagem que o usuário verá.
 */
export async function permitirTentativa(identificador: string, ip: string): Promise<void> {
  const agora = new Date();

  if (ip) {
    const desde = new Date(agora.getTime() - JANELA_IP_MINUTOS * 60_000);
    const recentes = await db.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: desde } },
    });
    if (recentes >= TETO_POR_IP) {
      throw new LoginBloqueado(
        `Muitas tentativas a partir deste dispositivo. Tente novamente em ${JANELA_IP_MINUTOS} minutos.`
      );
    }
  }

  const conta = await db.user.findUnique({
    where: { username: identificador },
    select: { lockedUntil: true },
  });

  if (conta?.lockedUntil && conta.lockedUntil > agora) {
    const faltam = Math.max(
      1,
      Math.ceil((conta.lockedUntil.getTime() - agora.getTime()) / 60_000)
    );
    throw new LoginBloqueado(
      `Acesso bloqueado temporariamente por tentativas seguidas. Tente novamente em ${faltam} minuto(s).`
    );
  }
}

/** Registra o erro, incrementa o contador e bloqueia ao atingir o limite. */
export async function registrarFalha(identificador: string, ip: string): Promise<void> {
  await db.loginAttempt.create({ data: { identificador, ip, success: false } });

  const conta = await db.user.findUnique({
    where: { username: identificador },
    select: { id: true, failedAttempts: true },
  });
  // Conta inexistente: a tentativa fica registrada para a barreira por origem,
  // mas não há contador a incrementar — e a resposta ao usuário continua a
  // mesma, para não revelar quais nomes de usuário existem.
  if (!conta) return;

  const total = conta.failedAttempts + 1;
  await db.user.update({
    where: { id: conta.id },
    data: {
      failedAttempts: total,
      lockedUntil:
        total >= MAX_TENTATIVAS
          ? new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000)
          : null,
    },
  });
}

/** Zera o contador e limpa o histórico velho. */
export async function registrarSucesso(
  userId: string,
  identificador: string,
  ip: string
): Promise<void> {
  await db.loginAttempt.create({ data: { identificador, ip, success: true } });
  await db.user.update({
    where: { id: userId },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  // Poda oportunista: evita uma tarefa agendada só para isto.
  const limite = new Date(Date.now() - RETENCAO_HORAS * 3_600_000);
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: limite } } });
}
