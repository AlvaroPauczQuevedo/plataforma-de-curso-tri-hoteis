import { NextResponse } from "next/server";
import { registrarErro } from "@/lib/monitoramento";
import { consumirVagaCompartilhada } from "@/lib/teto-compartilhado";

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

/*
  A contagem é global — não é por origem porque o objetivo não é ser justo
  entre visitantes, é não deixar o disco encher.

  Ela vivia numa variável de módulo, e isso era um furo: a hospedagem sobe
  vários processos, cada um com o próprio contador, e o teto real virava o
  configurado VEZES o número de processos, contra um disco que é um só. Agora o
  estado é compartilhado por arquivo (lib/teto-compartilhado); a regra de
  contagem continua a mesma, pura, em lib/teto-de-avisos.
*/
function dentroDoTeto(): boolean {
  return consumirVagaCompartilhada({
    arquivo: "avisos-de-tela.json",
    chave: "global",
    teto: TETO_POR_MINUTO,
    duracaoMs: JANELA_MS,
  });
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
