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
 * caminho de sessão. Em compensação nada daqui é gravado em banco e o corpo é
 * truncado, então o pior que alguém consegue é gerar avisos repetidos — que o
 * agrupamento por assinatura já contém.
 */
export async function POST(request: Request) {
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
