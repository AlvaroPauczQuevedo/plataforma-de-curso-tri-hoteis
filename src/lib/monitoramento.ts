/**
 * Aviso de erro em produção.
 *
 * O problema que isto resolve é concreto: quando o painel quebrou, o erro ficou
 * parado no log até alguém abrir a tela e reclamar. Aqui a falha vira um aviso
 * ativo — por e-mail, por webhook, ou pelos dois.
 *
 * Três decisões deliberadas:
 *
 *  - **Nunca lança.** Um monitoramento que derruba a requisição por não
 *    conseguir avisar sobre a falha é pior do que monitoramento nenhum.
 *  - **Agrupa por assinatura.** Uma página quebrada é aberta dezenas de vezes
 *    por minuto; sem agrupamento, o primeiro erro geraria uma enxurrada de
 *    e-mails e o aviso viraria ruído que se aprende a ignorar.
 *  - **Não guarda estado em banco.** O agrupamento vive em memória e se perde
 *    no reinício, o que é aceitável: reiniciar é justamente quando se quer
 *    saber se o problema voltou.
 *
 * Variáveis:
 *   ALERTA_EMAIL       destino dos avisos (usa o SMTP já configurado)
 *   ALERTA_WEBHOOK_URL endpoint que recebe um POST com JSON
 *   ALERTA_INTERVALO_MIN  minutos de silêncio por assinatura (padrão 30)
 */
import { enviarEmail, envioDisponivel } from "@/lib/email";
import { digestDoTexto, gravarErro } from "@/lib/registro-de-erros";

const ultimoAviso = new Map<string, number>();

function intervaloMs(): number {
  return Number(process.env.ALERTA_INTERVALO_MIN ?? 30) * 60 * 1000;
}

/**
 * Assinatura do erro: mensagem mais a primeira linha da pilha.
 *
 * A pilha inteira mudaria a cada requisição (ids, caminhos dinâmicos) e cada
 * ocorrência viraria um erro "novo", desfazendo o agrupamento.
 */
function assinatura(erro: unknown, contexto: string): string {
  const e = erro as Error;
  const primeiraLinha = (e?.stack ?? "").split("\n")[1]?.trim() ?? "";
  return `${contexto}|${e?.message ?? String(erro)}|${primeiraLinha}`;
}

function devoAvisar(chave: string): boolean {
  const agora = Date.now();
  const anterior = ultimoAviso.get(chave);
  if (anterior && agora - anterior < intervaloMs()) return false;
  ultimoAviso.set(chave, agora);
  return true;
}

async function avisarPorWebhook(corpo: unknown): Promise<void> {
  const url = process.env.ALERTA_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(5000),
    });
  } catch (falha) {
    console.error("[monitoramento] webhook falhou:", (falha as Error).message);
  }
}

/**
 * Registra um erro e avisa, se houver destino configurado.
 *
 * Sem ALERTA_EMAIL nem ALERTA_WEBHOOK_URL, só escreve no log — que é o
 * comportamento que a plataforma sempre teve.
 */
export async function registrarErro(erro: unknown, contexto: string): Promise<void> {
  const e = erro as Error;
  console.error(`[erro] ${contexto}:`, e?.stack ?? erro);

  /*
    Gravado ANTES do agrupamento, de propósito.

    O agrupamento existe para não inundar o e-mail de quem recebe o aviso, mas
    o registro tem o objetivo oposto: quem abre /admin/erros para investigar
    precisa ver todas as ocorrências, inclusive para saber se o problema
    aconteceu uma vez ou trezentas.
  */
  await gravarErro({
    quando: new Date().toISOString(),
    contexto,
    mensagem: e?.message ?? String(erro),
    digest: digestDoTexto(`${e?.message ?? ""} ${e?.stack ?? ""}`),
    stack: e?.stack,
  });

  const chave = assinatura(erro, contexto);
  if (!devoAvisar(chave)) return;

  const quando = new Date().toISOString();
  const detalhe = [
    `Contexto: ${contexto}`,
    `Quando: ${quando}`,
    `Mensagem: ${e?.message ?? String(erro)}`,
    "",
    (e?.stack ?? "").split("\n").slice(0, 8).join("\n"),
  ].join("\n");

  await avisarPorWebhook({ contexto, quando, mensagem: e?.message, stack: e?.stack });

  const destino = process.env.ALERTA_EMAIL;
  if (destino && envioDisponivel()) {
    await enviarEmail({
      para: destino,
      assunto: `[Academia] Erro em ${contexto}`,
      texto: [
        "A plataforma registrou um erro em produção.",
        detalhe,
        `Avisos iguais ficam em silêncio por ${process.env.ALERTA_INTERVALO_MIN ?? 30} minutos.`,
      ].join("\n\n"),
    });
  }
}

/** Zera o agrupamento. Existe para os testes; não use em produção. */
export function limparHistoricoDeAvisos(): void {
  ultimoAviso.clear();
}

/** Só para teste: quantas assinaturas distintas já avisaram. */
export function assinaturasConhecidas(): number {
  return ultimoAviso.size;
}
