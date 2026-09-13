import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOM,
  SEPARADOR,
  celulaCsv,
  dataCsv,
  dataHoraCsv,
  escaparFormula,
  gerarCsv,
  linhaCsv,
  nomeDeArquivoCsv,
  simNaoCsv,
} from "../src/lib/csv";

/**
 * O CSV é o único lugar do projeto onde um texto do banco vira código
 * executável na máquina de outra pessoa. Estes testes cobrem as três formas de
 * o arquivo sair errado: fórmula que executa, coluna que desloca e acento que
 * embaralha.
 */

describe("Injeção de fórmula", () => {
  it("neutraliza os quatro inícios que a planilha executa", () => {
    /*
      O caso real: um nome vindo da sincronização com a intranet, que é um
      banco que esta plataforma não controla. Abre no Excel do RH como fórmula.
    */
    for (const perigoso of ["=SOMA(A1)", "+1+1", "-2", "@import"]) {
      assert.equal(escaparFormula(perigoso), `'${perigoso}`, perigoso);
    }
  });

  it("neutraliza também tabulação e retorno de carro", () => {
    // Alguns leitores descartam o primeiro caractere ao abrir e revelam o
    // seguinte: "\t=cmd" viraria "=cmd" já dentro da planilha.
    assert.equal(escaparFormula("\t=cmd"), "'\t=cmd");
    assert.equal(escaparFormula("\r=cmd"), "'\r=cmd");
  });

  it("não mexe em nome de gente", () => {
    for (const nome of ["Maria da Conceição", "Sebastião Ferreira", "3M Hotelaria"]) {
      assert.equal(escaparFormula(nome), nome, nome);
    }
  });

  it("o apóstrofo fica DENTRO das aspas quando a célula é citada", () => {
    /*
      A ordem importa. Escapar depois de citar poria o apóstrofo antes da
      primeira aspa, e ele mesmo quebraria a célula em duas.
    */
    const celula = celulaCsv('=HYPERLINK("http://fora";"Clique")');

    assert.ok(celula.startsWith(`"'=`), celula);
    assert.ok(celula.endsWith('"'), celula);
  });

  it("string vazia não vira apóstrofo solto", () => {
    assert.equal(escaparFormula(""), "");
    assert.equal(celulaCsv(""), "");
  });
});

describe("Citação de células", () => {
  it("cita quando há separador, e é o ponto e vírgula", () => {
    assert.equal(celulaCsv("Recepção; Governança"), '"Recepção; Governança"');
    // Vírgula NÃO é separador aqui: o Excel em português usa `;`.
    assert.equal(celulaCsv("Silva, Maria"), "Silva, Maria");
  });

  it("dobra as aspas de dentro", () => {
    assert.equal(celulaCsv('Curso "Brigada"'), '"Curso ""Brigada"""');
  });

  it("cita quebra de linha em vez de deixar a linha se partir", () => {
    // Uma observação com Enter dentro deslocaria todas as colunas seguintes,
    // e o arquivo abriria sem erro nenhum — só errado.
    assert.equal(celulaCsv("linha1\nlinha2"), '"linha1\nlinha2"');
  });

  it("nulo e indefinido viram célula vazia, não a palavra 'null'", () => {
    assert.equal(celulaCsv(null), "");
    assert.equal(celulaCsv(undefined), "");
  });

  it("número passa como número", () => {
    assert.equal(celulaCsv(0), "0");
    assert.equal(celulaCsv(87), "87");
  });
});

describe("Arquivo completo", () => {
  it("abre com BOM, separa por ponto e vírgula e termina em CRLF", () => {
    const csv = gerarCsv(["Nome", "Situação"], [["Maria", "Em dia"]]);

    assert.ok(csv.startsWith(BOM), "sem BOM o Excel embaralha os acentos");
    assert.ok(csv.includes(`Nome${SEPARADOR}Situação`));
    assert.ok(csv.endsWith("\r\n"), "sem quebra final alguns leitores comem a última linha");
  });

  it("o cabeçalho passa pelo mesmo tratamento das células", () => {
    const csv = gerarCsv(["=Total"], [["1"]]);
    assert.ok(csv.includes("'=Total"));
  });

  it("uma planilha sem linhas ainda traz o cabeçalho", () => {
    // Arquivo vazio faria quem baixou achar que a exportação falhou.
    const csv = gerarCsv(["Nome"], []);
    assert.equal(csv, `${BOM}Nome\r\n`);
  });

  it("linhaCsv e gerarCsv concordam", () => {
    assert.equal(linhaCsv(["a", "b"]), `a${SEPARADOR}b`);
  });
});

describe("Formatos de célula", () => {
  it("data sai em dd/mm/aaaa, que o Excel brasileiro entende como data", () => {
    assert.equal(dataCsv(new Date("2026-03-15T12:00:00Z")), "15/03/2026");
  });

  it("data usa o fuso de São Paulo, não o do servidor", () => {
    /*
      A hospedagem roda em UTC. 31/03 às 21h no Brasil é 01/04 em UTC — sem a
      conversão explícita, o prazo aparece um dia depois do que a pessoa viu.
    */
    assert.equal(dataCsv(new Date("2026-04-01T00:30:00Z")), "31/03/2026");
  });

  it("data nula é célula vazia", () => {
    assert.equal(dataCsv(null), "");
    assert.equal(dataHoraCsv(undefined), "");
  });

  it("booleano vira Sim/Não, não VERDADEIRO/FALSO", () => {
    assert.equal(simNaoCsv(true), "Sim");
    assert.equal(simNaoCsv(false), "Não");
  });
});

describe("Nome do arquivo", () => {
  it("carrega o filtro aplicado, sem acento e sem espaço", () => {
    assert.equal(
      nomeDeArquivoCsv(["conformidade", "Recepção", "2026-09-12"]),
      "conformidade-recepcao-2026-09-12.csv"
    );
  });

  it("descarta partes vazias em vez de deixar traços soltos", () => {
    assert.equal(nomeDeArquivoCsv(["conformidade", "", null, "2026-09-12"]), "conformidade-2026-09-12.csv");
  });

  it("não deixa aspas nem quebra de linha escaparem para o cabeçalho HTTP", () => {
    /*
      O nome carrega um pedaço vindo do banco. Aspas ali encerrariam o valor de
      `content-disposition` e permitiriam acrescentar outro cabeçalho.
    */
    const nome = nomeDeArquivoCsv(['x"; y', "a\r\nSet-Cookie: b"]);

    assert.ok(!nome.includes('"'));
    assert.ok(!/[\r\n]/.test(nome));
  });

  it("nome que sobra vazio vira 'relatorio', não '.csv'", () => {
    assert.equal(nomeDeArquivoCsv(["***"]), "relatorio.csv");
  });
});
