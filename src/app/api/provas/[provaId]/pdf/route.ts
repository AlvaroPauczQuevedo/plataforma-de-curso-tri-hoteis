import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessaoDeApi } from "@/lib/session";
import { gerarProvaPdf } from "@/lib/prova-pdf";

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

  const conta = await db.user.findUnique({
    where: { id: usuario.id },
    select: { departmentId: true, role: true },
  });

  /*
    Administrador baixa qualquer prova, publicada ou não — ele precisa revisar
    o material antes de liberar. Funcionário só alcança prova publicada do seu
    departamento, ou prova geral.
  */
  const admin = conta?.role === "ADMIN";
  const alcanca =
    admin ||
    (prova.publicada &&
      (prova.departmentId === null || prova.departmentId === conta?.departmentId));

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
