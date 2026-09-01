import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessaoDeApi } from "@/lib/session";
import { gerarProvaPdf } from "@/lib/prova-pdf";
import { usuarioAlcancaProva } from "@/lib/alcance-de-provas";

/**
 * Baixa a prova em PDF, sem gabarito.
 *
 * O alcance é o mesmo da tela: prova publicada do departamento da pessoa, ou
 * prova geral. Sem esta checagem, bastaria conhecer o endereço para baixar a
 * prova de outro setor — e a rota é mais fácil de descobrir que a tela.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { provaId: string } }
) {
  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const prova = await db.prova.findUnique({
    where: { id: params.provaId },
    include: {
      department: true,
      questoes: {
        select: {
          enunciado: true,
          alternativas: { select: { texto: true }, orderBy: { ordem: "asc" } },
        },
        orderBy: { ordem: "asc" },
      },
    },
  });

  if (!prova) {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }

  /*
    O papel é relido do banco, e não tirado do token: a sessão dura 8 horas e
    não acompanha um rebaixamento de administrador feito nesse intervalo.
  */
  const conta = await db.user.findUnique({
    where: { id: usuario.id },
    select: { role: true },
  });

  /*
    Administrador baixa qualquer prova, publicada ou não — ele precisa revisar
    o material antes de liberar. Funcionário só baixa prova publicada, e só a
    que alcança pela regra compartilhada de lib/alcance-de-provas.
  */
  const admin = conta?.role === "ADMIN";

  const alcanca =
    admin || (prova.publicada && (await usuarioAlcancaProva(usuario.id, prova)));

  if (!alcanca) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  const pdf = await gerarProvaPdf({
    titulo: prova.titulo,
    descricao: prova.descricao,
    notaMinima: prova.notaMinima,
    departamento: prova.department?.name ?? null,
    questoes: prova.questoes,
  });

  const nome = prova.titulo.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prova-${nome}.pdf"`,
    },
  });
}
