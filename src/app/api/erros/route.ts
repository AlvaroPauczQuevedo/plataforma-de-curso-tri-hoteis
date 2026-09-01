import { NextResponse } from "next/server";
import { registrarErro } from "@/lib/monitoramento";

/**
 * Recebe do navegador o aviso de que uma tela quebrou.
 *
 * O erro em si já foi registrado no servidor com todo o rastro; o que chega
 * aqui é o `digest` que o Next mostrou ao usuário, mais a URL. Serve para
 * ligar uma coisa à outra e, principalmente, para disparar o aviso — sem isto
 * a falha ficaria parada no log até alguém reclamar.
 *
 * Sem autenticação de propósito: a tela pode ter quebrado justamente no
 * caminho de sessão. Em compensação nada daqui é gravado em banco, o corpo é
 * truncado e há teto por janela — sem ele, um laço de requisições enchia o
 * disco do servidor com o registro de erros, que é arquivo e não tem limite
 * próprio. O agrupamento por assinatura contém o e-mail; o teto contém o disco.
 */

/** Avisos de navegador aceitos por minuto, somando todos os visitantes. */
const TETO_POR_MINUTO = Number(process.env.ERROS_CLIENTE_LIMITE ?? 60);
const JANELA_MS = 60_000;

let janelaComecouEm = 0;
let recebidosNaJanela = 0;

/**
 * Consome uma vaga da janela. Devolve false quando o teto já estourou.
 *
 * Contagem global e em memória, como o agrupamento do monitoramento: não é
 * por origem porque o objetivo aqui não é ser justo entre visitantes, é não
 * deixar o disco encher.
 */
function dentroDoTeto(): boolean {
  const agora = Date.now();

  if (agora - janelaComecouEm > JANELA_MS) {
    janelaComecouEm = agora;
    recebidosNaJanela = 0;
  }

  recebidosNaJanela += 1;
  return recebidosNaJanela <= TETO_POR_MINUTO;
}

export async function POST(request: Request) {
  /*
    Descartado em silêncio, com a mesma resposta de sempre: quem já viu uma
    tela quebrada não ganha nada com um segundo erro, e a resposta não deve
    revelar que existe um teto.
  */
  if (!dentroDoTeto()) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const corpo = (await request.json()) as { digest?: unknown; url?: unknown };

    const digest = String(corpo.digest ?? "sem digest").slice(0, 100);
    const url = String(corpo.url ?? "desconhecida").slice(0, 300);

    await registrarErro(
      new Error(`Tela quebrou no navegador (digest ${digest})`),
      `cliente ${url}`
    );
  } catch {
    // Um aviso malformado não é motivo para responder erro a quem já viu um.
  }

  return new NextResponse(null, { status: 204 });
}
