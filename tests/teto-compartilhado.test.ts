import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

/*
  ANTES do módulo em teste: o teto compartilhado grava ao lado do registro de
  erros, e `ERROS_ROOT` é resolvido no instante em que aquele módulo é
  carregado. Sem este desvio, os arquivos de contagem cairiam na pasta de erros
  real do projeto — o mesmo cuidado que tests/erros-temporarios.ts existe para
  tomar, e o mesmo de tests/ambiente.ts com o DATABASE_URL.
*/
import { PASTA_DE_ERROS, limparPastaDeErros } from "./erros-temporarios";

import {
  consumirDoMapa,
  consumirVagaCompartilhada,
  type Mapa,
} from "../src/lib/teto-compartilhado";

/**
 * O teto que vale para TODOS os processos do servidor.
 *
 * `lib/teto-de-avisos` já conta certo, e tem teste próprio. O que se exercita
 * aqui é o que faltava: a contagem sobreviver ao processo. Ela vivia numa
 * variável de módulo, e a hospedagem sobe vários processos — com quatro deles,
 * um teto de 60 por minuto deixava passar 240, contra um disco que é um só.
 */

const JANELA_MS = 60_000;

/*
  A contagem mora um nível acima da pasta de erros — que aqui é temporária, mas
  cujo PAI é a pasta temporária do sistema, compartilhada com tudo mais. Por
  isso cada teste usa um nome de arquivo único: os arquivos de teste da suíte
  podem rodar ao mesmo tempo, e dois deles disputando o mesmo contador dariam
  uma falha intermitente que ninguém consegue reproduzir.
*/
const criados: string[] = [];

function arquivoNovo(): string {
  const nome = `teste-teto-${randomUUID()}.json`;
  criados.push(path.resolve(PASTA_DE_ERROS, "..", nome));
  return nome;
}

after(() => {
  for (const caminho of criados) {
    try {
      rmSync(caminho, { force: true });
    } catch {
      // Faxina de pasta temporária: falhar aqui não invalida teste nenhum.
    }
  }
  limparPastaDeErros();
});

describe("Contagem por chave", () => {
  it("cada chave tem o próprio teto", () => {
    let mapa: Mapa = {};
    const agora = 1_000_000;

    // Estoura a chave "ana" e não encosta na "bruno".
    for (let i = 0; i < 4; i += 1) {
      ({ mapa } = consumirDoMapa(mapa, "ana", agora, 3, JANELA_MS));
    }

    const daAna = consumirDoMapa(mapa, "ana", agora, 3, JANELA_MS);
    assert.equal(daAna.aceito, false, "ana já estourou");

    const doBruno = consumirDoMapa(daAna.mapa, "bruno", agora, 3, JANELA_MS);
    assert.equal(doBruno.aceito, true, "bruno não paga pelo excesso da ana");
  });

  it("aceita até o teto e recusa a partir dele", () => {
    let mapa: Mapa = {};
    let aceitos = 0;

    for (let i = 0; i < 10; i += 1) {
      const vaga = consumirDoMapa(mapa, "global", 1_000_000, 4, JANELA_MS);
      mapa = vaga.mapa;
      if (vaga.aceito) aceitos += 1;
    }

    assert.equal(aceitos, 4);
  });

  it("passada a janela, a chave volta a aceitar", () => {
    const inicio = 1_000_000;
    let mapa: Mapa = {};

    for (let i = 0; i < 5; i += 1) {
      ({ mapa } = consumirDoMapa(mapa, "global", inicio, 2, JANELA_MS));
    }

    const dentro = consumirDoMapa(mapa, "global", inicio + JANELA_MS, 2, JANELA_MS);
    assert.equal(dentro.aceito, false, "ainda dentro da janela");

    const depois = consumirDoMapa(mapa, "global", inicio + JANELA_MS + 1, 2, JANELA_MS);
    assert.equal(depois.aceito, true, "janela nova, teto novo");
  });
});

describe("Faxina do mapa", () => {
  it("chave velha é descartada, chave viva é preservada", () => {
    const inicio = 1_000_000;

    let mapa: Mapa = {};
    ({ mapa } = consumirDoMapa(mapa, "antiga", inicio, 5, JANELA_MS));
    ({ mapa } = consumirDoMapa(mapa, "recente", inicio + JANELA_MS * 3, 5, JANELA_MS));

    /*
      Sem a faxina, um teto por conta acumularia uma entrada por funcionário
      para sempre, e o arquivo cresceria sem nada para pará-lo.
    */
    const agora = inicio + JANELA_MS * 3;
    const { mapa: limpo } = consumirDoMapa(mapa, "nova", agora, 5, JANELA_MS);

    assert.equal("antiga" in limpo, false, "a janela da antiga passou faz tempo");
    assert.equal("recente" in limpo, true, "a recente ainda está viva");
    assert.equal("nova" in limpo, true);
  });
});

describe("Estado em arquivo", () => {
  it("a contagem sobrevive entre chamadas", () => {
    const arquivo = arquivoNovo();
    const pedir = () =>
      consumirVagaCompartilhada({ arquivo, chave: "global", teto: 3, duracaoMs: JANELA_MS });

    assert.equal(pedir(), true, "1º");
    assert.equal(pedir(), true, "2º");
    assert.equal(pedir(), true, "3º");
    assert.equal(pedir(), false, "4º já passou do teto");
  });

  it("arquivos diferentes não se misturam", () => {
    const avisos = arquivoNovo();
    const pedidos = arquivoNovo();

    assert.equal(
      consumirVagaCompartilhada({ arquivo: avisos, chave: "global", teto: 1, duracaoMs: JANELA_MS }),
      true
    );
    assert.equal(
      consumirVagaCompartilhada({ arquivo: avisos, chave: "global", teto: 1, duracaoMs: JANELA_MS }),
      false,
      "o teto daquele arquivo estourou"
    );
    assert.equal(
      consumirVagaCompartilhada({ arquivo: pedidos, chave: "global", teto: 1, duracaoMs: JANELA_MS }),
      true,
      "o outro contador começa do zero"
    );
  });

  it("chaves separadas dentro do mesmo arquivo", () => {
    // É como a redefinição de senha usa: um teto por conta e um global, no
    // mesmo arquivo.
    const arquivo = arquivoNovo();
    const pedir = (chave: string, teto: number) =>
      consumirVagaCompartilhada({ arquivo, chave, teto, duracaoMs: JANELA_MS });

    assert.equal(pedir("conta-1", 1), true);
    assert.equal(pedir("conta-1", 1), false, "a conta 1 estourou");
    assert.equal(pedir("conta-2", 1), true, "a conta 2 não paga por isso");
  });
});
