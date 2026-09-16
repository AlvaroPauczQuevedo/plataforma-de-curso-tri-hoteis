"use client";

import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";

/**
 * O QR da lista de presença, girando junto com o código.
 *
 * O segredo da sessão NUNCA chega ao navegador. A página pergunta ao servidor
 * qual é o código agora e desenha o QR com ele; quando a janela vira, pergunta
 * de novo. Mandar o segredo e deixar o cliente derivar seria mais econômico e
 * entregaria, a quem abrisse o inspetor, a capacidade de gerar códigos válidos
 * de casa — que é exatamente o que este módulo existe para impedir.
 *
 * Desenha em SVG em vez de `<canvas>`: amplia sem borrar, e esta tela costuma
 * ir para um projetor ou para a TV do salão.
 */
export function QrDaSessao({ sessaoId, endereco }: { sessaoId: string; endereco: string }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;

    async function buscar() {
      try {
        const r = await fetch(`/api/presenca/${sessaoId}/codigo`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const dados = await r.json();
        if (!vivo) return;
        setCodigo(dados.codigo);
        setErro(false);
      } catch {
        if (vivo) setErro(true);
      }
    }

    buscar();
    /*
      A cada 10 segundos, e não a cada 30. A janela dura 30, mas o relógio do
      navegador não está alinhado com a virada dela: perguntando três vezes por
      janela, a tela nunca mostra um código morto por mais de dez segundos —
      e a validação ainda aceita a janela anterior, então a emenda é invisível.
    */
    const timer = setInterval(buscar, 10_000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [sessaoId]);

  const svg = useMemo(() => {
    if (!codigo) return null;

    // Correção "M": ~15% de tolerância. A tela pode ter reflexo, e a câmera do
    // celular de quem está no fundo do salão não é a melhor.
    const qr = qrcode(0, "M");
    qr.addData(`${endereco}/presenca/${sessaoId}/${codigo}`);
    qr.make();

    const modulos = qr.getModuleCount();
    // Quatro módulos de zona de silêncio: sem ela o leitor não acha as bordas.
    const borda = 4;
    const lado = modulos + borda * 2;

    const quadrados: string[] = [];
    for (let linha = 0; linha < modulos; linha += 1) {
      for (let coluna = 0; coluna < modulos; coluna += 1) {
        if (!qr.isDark(linha, coluna)) continue;
        quadrados.push(`M${coluna + borda},${linha + borda}h1v1h-1z`);
      }
    }

    return { caminho: quadrados.join(""), lado };
  }, [codigo, sessaoId, endereco]);

  if (erro) {
    return (
      <div className="flex aspect-square w-full max-w-xs items-center justify-center rounded-2xl border border-border bg-surface-muted p-6 text-center text-sm text-ink-700/70">
        Não consegui atualizar o código. Confira a conexão — sem ele ninguém marca presença.
      </div>
    );
  }

  if (!svg || !codigo) {
    return (
      <div className="aspect-square w-full max-w-xs animate-pulse rounded-2xl border border-border bg-surface-muted" />
    );
  }

  return (
    <div className="w-full max-w-xs">
      {/*
        Fundo branco sempre, inclusive no tema escuro: leitor de QR espera
        módulos escuros sobre claro, e um código invertido simplesmente não lê.
      */}
      <div className="rounded-2xl bg-white p-3">
        <svg
          viewBox={`0 0 ${svg.lado} ${svg.lado}`}
          className="h-auto w-full"
          shapeRendering="crispEdges"
          role="img"
          aria-label="Código para marcar presença"
        >
          <rect width={svg.lado} height={svg.lado} fill="#ffffff" />
          <path d={svg.caminho} fill="#1c1917" />
        </svg>
      </div>

      {/*
        O código também em texto. A câmera falha — tela suja, reflexo, celular
        velho —, e sem esta saída a pessoa fica de fora da lista por causa do
        aparelho dela.
      */}
      <p className="mt-3 text-center">
        <span className="block text-xs uppercase tracking-wide text-ink-700/60">
          ou digite o código
        </span>
        <span className="mt-0.5 block font-mono text-2xl font-semibold tracking-[0.2em] text-ink-900">
          {codigo}
        </span>
      </p>
    </div>
  );
}
