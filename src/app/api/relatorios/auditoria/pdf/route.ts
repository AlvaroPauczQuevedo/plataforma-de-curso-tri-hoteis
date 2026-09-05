import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessaoDeApi } from "@/lib/session";
import { gerarAuditoriaPdf } from "@/lib/auditoria-pdf";
import { levantarAuditoria } from "@/lib/auditoria";

/**
 * Baixa o relatório de treinamentos obrigatórios em PDF.
 *
 * Só administrador. O documento lista nome, situação e código de certificado
 * de gente que não é quem baixa — é exatamente o tipo de coisa que não pode
 * depender de a tela estar escondida no menu, porque o endereço é mais fácil
 * de descobrir do que a tela.
 *
 * O papel é relido do banco, e não tirado do token: a sessão dura 8 horas, e
 * quem perdeu o acesso administrativo nesse intervalo não deve continuar
 * baixando a folha da rede inteira.
 */
export async function GET(request: NextRequest) {
  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const conta = await db.user.findUnique({
    where: { id: usuario.id },
    select: { role: true, active: true },
  });
  if (!conta?.active || conta.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const departamentoId = request.nextUrl.searchParams.get("departamento") || undefined;

  const relatorio = await levantarAuditoria({ departamentoId });
  const pdf = await gerarAuditoriaPdf(relatorio);

  const sufixo = relatorio.departamentoFiltrado
    ? `-${relatorio.departamentoFiltrado.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    : "";
  const dia = relatorio.geradoEm.toISOString().slice(0, 10);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      // `attachment` para o navegador baixar em vez de abrir numa aba: quem
      // pede este relatório vai anexá-lo em algum lugar.
      "content-disposition": `attachment; filename="treinamentos-obrigatorios-${dia}${sufixo}.pdf"`,
      // Um relatório de auditoria não pode vir de cache: ele afirma uma
      // situação numa data, e servir o de ontem seria pior do que não servir.
      "cache-control": "no-store",
    },
  });
}
