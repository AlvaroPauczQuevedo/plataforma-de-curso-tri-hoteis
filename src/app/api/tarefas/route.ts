/**
 * A porta do agendador.
 *
 * A plataforma sobe em modo standalone: não há processo de fundo, não há
 * terminal no servidor, e um temporizador dentro da aplicação dispararia de
 * novo a cada reinício e uma vez por instância — a mesma armadilha que o
 * `scripts/resumo-conformidade.mjs` já documenta. O que a hospedagem sabe
 * fazer é chamar uma URL na hora marcada. Então a rotina mora aqui.
 *
 *   # cron, toda segunda às 8h
 *   0 8 * * 1  curl -fsS -X POST -H "x-cron-secret: SEGREDO" https://SEU-DOMINIO/api/tarefas
 *
 * PÚBLICA no roteamento, fechada pelo segredo. É a mesma decisão do
 * `/api/saude`, com a diferença que aqui a rotina ESCREVE (manda e-mail,
 * registra lembrete), então ela não pode ser aberta:
 *
 *  - sem `CRON_SECRET` definida, responde 503 e não faz nada. Falha fechada:
 *    uma variável esquecida não pode deixar a porta aberta;
 *  - a comparação é em tempo constante, para o segredo não vazar pelo tempo
 *    de resposta — a mesma preocupação que o login trata com o bcrypt-isca;
 *  - o segredo vai no CABEÇALHO. A query string aparece em log de servidor e
 *    em histórico de proxy; o cabeçalho, não.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispararLembretes } from "@/lib/lembretes";
import { registrarErro } from "@/lib/monitoramento";

/* A resposta é sobre o AGORA, e a rotina escreve. Nunca em cache. */
export const dynamic = "force-dynamic";

/** Compara sem revelar, pelo tempo, quantos caracteres bateram. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige o mesmo tamanho; tamanhos diferentes já são "não".
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function autorizada(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET ?? "";
  if (!esperado) return false;

  const cabecalho =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  return segredoConfere(cabecalho, esperado);
}

async function executar(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { erro: "Rotina não configurada: defina CRON_SECRET no ambiente." },
      { status: 503 }
    );
  }

  if (!autorizada(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const relatorio = await dispararLembretes();
    /*
      O relatório volta no corpo para o agendador poder guardá-lo, e a fila de
      WhatsApp vem junto: é ela que diz quem precisa ser chamado à mão. Quem
      quiser agir pela tela usa a Conformidade, que já tem os botões.
    */
    return NextResponse.json({ ok: true, ...relatorio });
  } catch (erro) {
    /*
      Falhar aqui é silencioso por natureza — ninguém está olhando quando o
      cron roda de madrugada. Então o erro vai para o monitoramento, que avisa
      pelos canais já configurados, antes de virar um 500 que só o agendador vê.
    */
    await registrarErro(erro, "rotina agendada — lembretes");
    return NextResponse.json({ erro: "A rotina falhou. Ver /admin/erros." }, { status: 500 });
  }
}

/*
  POST é o verbo certo: a rotina muda estado. O GET existe porque parte dos
  agendadores de hospedagem só sabe fazer GET, e recusar isso obrigaria a
  montar um intermediário só para trocar o verbo.
*/
export async function POST(request: NextRequest) {
  return executar(request);
}

export async function GET(request: NextRequest) {
  return executar(request);
}
