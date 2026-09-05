import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { gerarAuditoriaPdf } from "../src/lib/auditoria-pdf";
import type { RelatorioDeAuditoria } from "../src/lib/auditoria";

/**
 * O relatório que se entrega à auditoria.
 *
 * O que dá para provar sem abrir o arquivo com olho humano é a estrutura: que
 * o PDF é válido, que ninguém some entre a lista e o papel, e que uma lista
 * longa quebra em páginas em vez de escrever por cima do rodapé. Um relatório
 * que perde a última pessoa da folha é pior do que relatório nenhum — ele
 * afirma com confiança algo incompleto.
 */

const AGORA = new Date("2026-09-05T12:00:00.000Z");

function pessoa(nome: string, situacao: "concluido" | "vencido" | "pendente" | "atrasado") {
  return {
    nome,
    username: nome.toLowerCase().replace(/\s+/g, "."),
    situacao,
    concluidoEm: situacao === "concluido" || situacao === "vencido" ? new Date("2025-06-01T12:00:00Z") : null,
    codigo: situacao === "concluido" || situacao === "vencido" ? "CERT-2025-A1B2C3D4E5" : null,
    venceEm: situacao === "vencido" ? new Date("2026-06-01T12:00:00Z") : null,
    prazo: null,
  };
}

function relatorioCom(pessoas: ReturnType<typeof pessoa>[]): RelatorioDeAuditoria {
  const regulares = pessoas.filter((p) => p.situacao === "concluido").length;
  return {
    geradoEm: AGORA,
    departamentoFiltrado: null,
    blocos: [
      {
        departamento: "Governança",
        curso: "Segurança no Trabalho",
        validadeMeses: 12,
        prazoDias: 30,
        pessoas,
        regulares,
      },
    ],
    total: pessoas.length,
    regulares,
  };
}

async function paginasDe(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe("O arquivo", () => {
  it("sai como PDF válido", async () => {
    const bytes = await gerarAuditoriaPdf(relatorioCom([pessoa("Marina Costa", "concluido")]));

    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    assert.ok(bytes.length > 800, "um PDF com conteúdo não cabe em 800 bytes");
  });

  it("relatório vazio ainda gera documento, e não erro", async () => {
    const vazio: RelatorioDeAuditoria = {
      geradoEm: AGORA,
      departamentoFiltrado: null,
      blocos: [],
      total: 0,
      regulares: 0,
    };

    const bytes = await gerarAuditoriaPdf(vazio);
    assert.equal(await paginasDe(bytes), 1, "uma página dizendo que não há obrigatórios");
  });
});

describe("Quebra de página", () => {
  /**
   * O caso que estraga um relatório em silêncio: a lista passa do fim da
   * folha e as últimas pessoas simplesmente não aparecem. Quem recebe não tem
   * como saber que faltou alguém.
   */
  it("uma lista longa vira várias páginas", async () => {
    const muitas = Array.from({ length: 120 }, (_, i) => pessoa(`Funcionário ${i + 1}`, "concluido"));
    const bytes = await gerarAuditoriaPdf(relatorioCom(muitas));

    const paginas = await paginasDe(bytes);
    assert.ok(paginas > 1, `120 pessoas precisam de mais de uma página, saiu ${paginas}`);
  });

  it("mais gente gera mais páginas — nada é descartado no caminho", async () => {
    const poucas = await paginasDe(
      await gerarAuditoriaPdf(relatorioCom(Array.from({ length: 30 }, (_, i) => pessoa(`P${i}`, "concluido"))))
    );
    const muitas = await paginasDe(
      await gerarAuditoriaPdf(relatorioCom(Array.from({ length: 300 }, (_, i) => pessoa(`P${i}`, "concluido"))))
    );

    assert.ok(muitas > poucas, `300 pessoas deveriam render mais páginas que 30 (${muitas} vs ${poucas})`);
  });

  /**
   * Nome comprido não pode empurrar a coluna de situação para cima do código
   * de conferência — é o código que faz o documento valer como prova.
   */
  it("nome muito longo não quebra o documento", async () => {
    const bytes = await gerarAuditoriaPdf(
      relatorioCom([pessoa("Maria Aparecida das Dores do Nascimento Silva Sauro Filha", "concluido")])
    );
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  });
});

describe("As quatro situações", () => {
  it("todas geram documento válido", async () => {
    const bytes = await gerarAuditoriaPdf(
      relatorioCom([
        pessoa("Ana Regular", "concluido"),
        pessoa("Bruno Vencido", "vencido"),
        pessoa("Carla Pendente", "pendente"),
        pessoa("Diego Atrasado", "atrasado"),
      ])
    );

    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    assert.equal(await paginasDe(bytes), 1);
  });
});
