import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAXIMO_DE_PESSOAS,
  lerPessoas,
  resolverConflitos,
} from "../src/lib/lote-de-funcionarios";

/**
 * A leitura da lista colada no cadastro de funcionários em lote.
 *
 * A action chama estas mesmas funções. O que se testa aqui é o que decide qual
 * login cada pessoa da rede vai receber — e login errado é a pessoa não
 * conseguir entrar no primeiro dia.
 */

describe("A leitura da lista de pessoas", () => {
  it("gera primeiro.ultimo a partir do nome completo", () => {
    const [p] = lerPessoas("João Pereira da Silva");
    assert.equal(p.nome, "João Pereira da Silva");
    assert.equal(p.usuario, "joao.silva");
    assert.equal(p.problema, null);
  });

  it("separa o cargo por ponto e vírgula", () => {
    // Vírgula não serve: nome de pessoa leva vírgula ("Silva, Jr.") e partir
    // por ela cortaria nomes ao meio em silêncio.
    const [p] = lerPessoas("Maria Aparecida Souza; Recepcionista");
    assert.equal(p.usuario, "maria.souza");
    assert.equal(p.cargo, "Recepcionista");
  });

  it("aceita linha sem cargo", () => {
    const [p] = lerPessoas("Carlos Mendes");
    assert.equal(p.cargo, null);
  });

  it("descarta linha vazia e quebra do Windows", () => {
    const pessoas = lerPessoas("Ana Lima\r\n\r\n  \r\nBruno Costa");
    assert.equal(pessoas.length, 2);
    assert.deepEqual(pessoas.map((p) => p.usuario), ["ana.lima", "bruno.costa"]);
  });

  it("marca o nome que não vira login em vez de descartar em silêncio", () => {
    // Some da lista seria pior: quem colou trinta linhas e recebeu vinte e
    // nove cadastros não tem como saber quem ficou de fora.
    const [p] = lerPessoas("!!!");
    assert.ok(p.problema, "deveria trazer um problema");
    assert.equal(p.usuario, "");
  });

  it("marca nome curto demais para virar login", () => {
    const [p] = lerPessoas("Jô");
    assert.ok(p.problema);
  });
});

describe("O desempate de logins repetidos", () => {
  it("acrescenta o nome do meio quando o login já existe", () => {
    /*
      É o que a pessoa faria à mão. "joao.pereira.silva" é reconhecível pelo
      dono; "joao.silva2" não diz nada a ninguém.
    */
    const pessoas = lerPessoas("João Pereira da Silva");
    const [p] = resolverConflitos(pessoas, new Set(["joao.silva"]));
    assert.equal(p.usuario, "joao.pereira.silva");
    assert.equal(p.problema, null);
  });

  it("desempata também DENTRO do próprio lote", () => {
    // Dois homônimos colados juntos: o segundo não pode receber o mesmo login
    // do primeiro só porque nenhum dos dois estava no banco ainda.
    const pessoas = lerPessoas("João Pereira da Silva\nJoão Antunes da Silva");
    const [a, b] = resolverConflitos(pessoas, new Set());
    assert.equal(a.usuario, "joao.silva");
    assert.equal(b.usuario, "joao.antunes.silva");
    assert.notEqual(a.usuario, b.usuario);
  });

  it("recusa quando nem o nome do meio resolve, em vez de numerar", () => {
    /*
      Dois nomes completos idênticos precisam de olho humano. Inventar um
      sufixo aqui esconderia justamente o caso que merece atenção — pode ser a
      mesma pessoa cadastrada duas vezes.
    */
    const pessoas = lerPessoas("Ana Lima\nAna Lima");
    const [a, b] = resolverConflitos(pessoas, new Set());
    assert.equal(a.problema, null);
    assert.ok(b.problema);
    assert.match(b.problema ?? "", /já está em uso/);
  });

  it("não altera a lista que recebeu", () => {
    // A tela recompara antes e depois; mutar a entrada quebraria isso.
    const pessoas = lerPessoas("João Pereira da Silva");
    const antes = pessoas[0].usuario;
    resolverConflitos(pessoas, new Set(["joao.silva"]));
    assert.equal(pessoas[0].usuario, antes);
  });

  it("deixa passar quem já vinha com problema, sem mascarar", () => {
    const pessoas = lerPessoas("!!!");
    const [p] = resolverConflitos(pessoas, new Set());
    assert.ok(p.problema);
  });

  it("tem um teto acima de qualquer hotel da rede", () => {
    assert.ok(MAXIMO_DE_PESSOAS >= 200);
  });
});
