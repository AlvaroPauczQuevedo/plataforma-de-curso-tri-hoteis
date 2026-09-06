import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAXIMO_DO_LOTE,
  chaveDeComparacao,
  nomesDoLote,
} from "../src/lib/lote-de-unidades";

/**
 * A leitura do texto colado no cadastro de hotéis em lote.
 *
 * A action chama estas mesmas funções — não uma cópia da regra. O que se testa
 * aqui é o que decide, em produção, se dois nomes são a mesma casa.
 */

describe("A leitura do lote de hotéis", () => {
  it("aceita um nome por linha, na ordem colada", () => {
    assert.deepEqual(
      nomesDoLote("Tri Hotel Canela\nTri Hotel Xanxerê\nTri Hotel Praia Grande"),
      ["Tri Hotel Canela", "Tri Hotel Xanxerê", "Tri Hotel Praia Grande"]
    );
  });

  it("descarta linha vazia e espaço em volta", () => {
    // Colagem de planilha vem cheia de linha vazia; cada uma viraria um erro
    // de "informe o nome" no meio de um lote bom.
    assert.deepEqual(nomesDoLote("\n  Tri Hotel Canela  \n\n\nTri Hotel Lajeado\n"), [
      "Tri Hotel Canela",
      "Tri Hotel Lajeado",
    ]);
  });

  it("aceita quebra de linha do Windows", () => {
    // O usuário cola de um navegador no Windows; sem isto o \r ficaria colado
    // no fim de cada nome e todo hotel entraria com um caractere invisível.
    assert.deepEqual(nomesDoLote("Tri Hotel Canela\r\nTri Hotel Lajeado"), [
      "Tri Hotel Canela",
      "Tri Hotel Lajeado",
    ]);
  });

  it("trata o mesmo nome com outra caixa como repetido", () => {
    // O índice único do banco diferencia maiúsculas: sem esta regra, os dois
    // entrariam e a rede teria dois hotéis para a mesma casa.
    assert.deepEqual(nomesDoLote("Tri Hotel Canela\nTRI HOTEL CANELA"), [
      "Tri Hotel Canela",
    ]);
  });

  it("trata o mesmo nome sem acento como repetido", () => {
    assert.deepEqual(
      nomesDoLote("Tri Hotel Antônio Prado\nTri Hotel Antonio Prado"),
      ["Tri Hotel Antônio Prado"]
    );
  });

  it("mantém a primeira grafia, que foi a que a pessoa escreveu", () => {
    assert.deepEqual(nomesDoLote("tri hotel canela\nTri Hotel Canela"), [
      "tri hotel canela",
    ]);
  });

  it("não confunde hotéis diferentes da mesma cidade", () => {
    /*
      Seis cidades da rede têm mais de uma unidade — Caxias do Sul e Chapecó
      têm três cada. Se a comparação fosse por cidade, o cadastro perderia
      hotéis inteiros em silêncio.
    */
    const nomes = nomesDoLote(
      [
        "Tri Hotel Executive Caxias",
        "Tri Hotel Smart Caxias",
        "Tri Hotel & Flat Caxias",
      ].join("\n")
    );
    assert.equal(nomes.length, 3);
  });

  it("ignora espaço repetido só ao comparar, nunca ao gravar", () => {
    assert.equal(chaveDeComparacao("Tri  Hotel   Canela"), "tri hotel canela");
    // O nome gravado preserva o que foi digitado, menos as pontas.
    assert.deepEqual(nomesDoLote("  Tri Hotel  Canela  "), ["Tri Hotel  Canela"]);
  });

  it("tem um teto acima do tamanho da rede", () => {
    // 25 hotéis hoje; o teto existe para a planilha colada por engano.
    assert.ok(MAXIMO_DO_LOTE > 25);
  });
});
