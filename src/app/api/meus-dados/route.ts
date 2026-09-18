import { NextResponse } from "next/server";
import { sessaoDeApi } from "@/lib/session";
import { reunirMeusDados } from "@/lib/meus-dados";

/**
 * Exportação dos próprios dados — portabilidade do Art. 18, V da LGPD.
 *
 * **JSON, e não CSV.** O inciso pede "formato interoperável e de uso comum", e
 * o destino previsto é outro sistema, não o Excel de alguém. Um CSV achataria
 * as sete listas (treinamentos, certificados, presenças…) numa planilha só, ou
 * exigiria sete arquivos. O JSON preserva a estrutura, que é o que torna a
 * portabilidade útil de verdade.
 *
 * **Não aceita id por parâmetro.** A pessoa exporta o que é dela, e só. O id
 * vem da sessão; aceitar `?userId=` faria desta rota a maneira mais fácil de
 * baixar a ficha de um colega inteiro, e nenhuma quantidade de conferência
 * depois compensaria essa porta existir.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const dados = await reunirMeusDados(usuario.id);
  if (!dados) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const dia = new Date().toISOString().slice(0, 10);
  const arquivo = `meus-dados-${dados.identificacao.usuario}-${dia}.json`;

  return new NextResponse(JSON.stringify(dados, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${arquivo}"`,
      /*
        Nunca em cache: é o retrato dos dados de uma pessoa num instante, e um
        intermediário guardando isso é exatamente o que não pode acontecer com
        conteúdo pessoal.
      */
      "cache-control": "no-store, private",
    },
  });
}
