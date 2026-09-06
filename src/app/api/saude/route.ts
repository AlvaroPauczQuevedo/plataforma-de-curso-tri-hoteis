/**
 * Diagnóstico do servidor, sem exigir login.
 *
 * Existe porque diagnosticar esta plataforma virou um vaivém caro: sem
 * terminal na hospedagem e com o login quebrado, a única evidência disponível
 * era o log do painel, colado à mão, uma publicação por vez. Quatro apagões
 * seguidos tiveram a mesma causa — código novo no ar com o banco no schema
 * antigo — e em nenhum deles deu para responder de fora a pergunta mais
 * básica: "a versão nova subiu, e o banco acompanhou?".
 *
 * PÚBLICA de propósito, e essa é a decisão que precisa de justificativa. Ela
 * serve justamente quando ninguém consegue entrar; exigir sessão a tornaria
 * inútil no único momento em que importa. Por isso o que ela devolve é
 * escolhido a dedo: marca da versão, nomes de migração e se uma consulta
 * funciona. Nada de dado de pessoa, nada de contagem, nada de configuração —
 * nomes de migração já aparecem no repositório e não abrem nenhuma porta.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { migracoesPendentes, ultimoRelatorioDeMigracao } from "@/lib/migracoes";

/*
  Nunca em cache: a resposta é sobre o estado de AGORA. Uma resposta guardada
  diria que está tudo bem depois de já ter deixado de estar.
*/
export const dynamic = "force-dynamic";

/**
 * Muda a cada alteração desta rota.
 *
 * É o que responde "a publicação reconstruiu?" sem depender do painel: se o
 * valor devolvido não for o desta linha, o que está no ar é build antigo — e
 * aí o problema é a publicação, não o código.
 */
const MARCA = "2026-09-06-migracao-no-processo";

export async function GET() {
  const resposta: Record<string, unknown> = { marca: MARCA };

  // Estado das migrações. O `cwd` vai junto porque já foi ele o culpado:
  // se a pasta não estiver onde o processo procura, a conferência de schema
  // na subida não roda, e sem esse dado não dá para saber disso de fora.
  try {
    const pendentes = await migracoesPendentes();
    resposta.migracoes = {
      pendentes,
      emDia: pendentes.length === 0,
    };
  } catch (erro) {
    resposta.migracoes = {
      erro: (erro as Error)?.message?.slice(0, 300),
      cwd: process.cwd(),
    };
  }

  /*
    O que a subida tentou fazer, e no que deu.

    É a diferença entre "o banco está atrasado" e "o banco está atrasado
    PORQUE tal migração falhou com tal erro". Sem isto, descobrir o segundo
    exige o log do painel colado à mão — o vaivém que esta rota veio encerrar.
    Nulo significa que a rotina de subida não chegou a rodar neste processo.
  */
  resposta.ultimaSubida = ultimoRelatorioDeMigracao();

  /*
    A consulta que o login faz.

    `findFirst` sem `select` lê a linha inteira, que é o ponto: foi assim que
    uma coluna faltando derrubou a autenticação inteira enquanto telas que liam
    poucos campos continuavam funcionando e escondendo o problema. Só o
    resultado da tentativa sai daqui — nunca a linha.
  */
  try {
    await db.user.findFirst({ orderBy: { createdAt: "asc" } });
    resposta.login = { consultaOk: true };
  } catch (erro) {
    resposta.login = {
      consultaOk: false,
      erro: (erro as Error)?.message?.split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 300),
    };
  }

  const saudavel =
    (resposta.migracoes as { emDia?: boolean })?.emDia === true &&
    (resposta.login as { consultaOk?: boolean })?.consultaOk === true;

  return NextResponse.json({ ok: saudavel, ...resposta }, { status: saudavel ? 200 : 503 });
}
