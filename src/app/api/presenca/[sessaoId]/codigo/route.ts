import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessaoDeApi } from "@/lib/session";
import { bloqueioDeCurso } from "@/lib/alcance-admin";
import { aceitaCheckIn, codigoVigente } from "@/lib/presenca";

/**
 * O código que deve estar na tela agora.
 *
 * Existe para a tela do instrutor poder redesenhar o QR sem receber o segredo
 * da sessão. O segredo fica no servidor; o que sai é um código que morre em
 * trinta segundos — se vazar, vazou algo já visível na parede da sala.
 *
 * **Só administrador, e só quem alcança o curso.** Um funcionário que
 * conseguisse ler esta rota teria o código sem estar na sala, e a rotação
 * deixaria de significar qualquer coisa: bastaria pedir o código a cada trinta
 * segundos, de casa. É a trava que sustenta o módulo inteiro.
 *
 * O papel vem de `sessaoDeApi`, que relê a conta do banco: quem foi rebaixado
 * não continua emitindo códigos pelas 8 horas restantes do token.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ sessaoId: string }> }
) {
  const { sessaoId } = await contexto.params;

  const usuario = await sessaoDeApi();
  if (!usuario) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (usuario.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const sessao = await db.sessaoPresencial.findUnique({
    where: { id: sessaoId },
    select: { segredo: true, courseId: true, abertaAte: true, encerradaEm: true },
  });
  if (!sessao) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });

  // Alcance do curso, como em toda ação de conteúdo desta plataforma.
  const bloqueio = await bloqueioDeCurso(sessao.courseId, usuario.id);
  if (bloqueio) return NextResponse.json({ error: bloqueio.error }, { status: 403 });

  const agora = new Date();
  if (!aceitaCheckIn(sessao, agora)) {
    /*
      Sessão fechada não emite código. Sem isto, o QR de uma sessão encerrada
      continuaria girando na tela esquecida de alguém, e o bipe seria recusado
      só lá na frente — com a pessoa achando que marcou presença.
    */
    return NextResponse.json({ error: "Sessão encerrada." }, { status: 409 });
  }

  return NextResponse.json(
    { codigo: codigoVigente(sessao.segredo, agora) },
    // O código muda a cada 30s: cache aqui serviria código morto.
    { headers: { "cache-control": "no-store" } }
  );
}
