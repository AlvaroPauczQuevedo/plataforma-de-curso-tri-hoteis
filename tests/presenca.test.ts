import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JANELA_SEGUNDOS,
  aceitaCheckIn,
  codigoDaJanela,
  codigoValido,
  codigoVigente,
  janelaDe,
  novoSegredoDeSessao,
  presencasParaConcluir,
  situacaoDaSessao,
} from "../src/lib/presenca";

/**
 * O código rotativo da lista de presença.
 *
 * O que estes testes protegem é a única objeção séria ao check-in por QR: a
 * foto do código mandada no grupo do WhatsApp. Se um código de 14h02 ainda
 * valer às 14h05, três pessoas que não estavam na sala aparecem treinadas em
 * brigada de incêndio — e é isso que uma auditoria vai encontrar.
 */

const SEGREDO = "a".repeat(64);
const AGORA = new Date("2026-09-15T14:02:00Z");
const maisSegundos = (n: number) => new Date(AGORA.getTime() + n * 1000);

describe("Geração do código", () => {
  it("tem seis caracteres, sem os ambíguos", () => {
    // Quando a câmera não lê, alguém digita. Num salão com luz ruim, 0 e O são
    // o mesmo desenho.
    const codigo = codigoVigente(SEGREDO, AGORA);

    assert.equal(codigo.length, 6);
    assert.match(codigo, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.ok(!/[O0I1L]/.test(codigo), codigo);
  });

  it("é o mesmo dentro da mesma janela", () => {
    assert.equal(codigoVigente(SEGREDO, AGORA), codigoVigente(SEGREDO, maisSegundos(29)));
  });

  it("MUDA quando a janela vira", () => {
    assert.notEqual(codigoVigente(SEGREDO, AGORA), codigoDaJanela(SEGREDO, janelaDe(AGORA) + 1));
  });

  it("dois segredos dão códigos diferentes na mesma janela", () => {
    // Senão a sessão de um hotel validaria o bipe do outro.
    const outro = "b".repeat(64);
    assert.notEqual(codigoVigente(SEGREDO, AGORA), codigoVigente(outro, AGORA));
  });

  it("cada sessão nasce com um segredo próprio", () => {
    assert.notEqual(novoSegredoDeSessao(), novoSegredoDeSessao());
    assert.equal(novoSegredoDeSessao().length, 64);
  });

  it("a janela dura 30 segundos", () => {
    assert.equal(JANELA_SEGUNDOS, 30);
    assert.equal(janelaDe(maisSegundos(JANELA_SEGUNDOS)), janelaDe(AGORA) + 1);
  });
});

describe("Validação do código", () => {
  it("aceita o código da janela corrente", () => {
    assert.ok(codigoValido(SEGREDO, codigoVigente(SEGREDO, AGORA), AGORA));
  });

  it("aceita o da janela anterior, por causa do relógio do celular", () => {
    /*
      Entre apontar a câmera e a página carregar passam segundos. Sem esta
      tolerância, quem mira a tela no segundo 29 é recusado sem entender, e vai
      dizer que "o QR não funciona".
    */
    const antigo = codigoDaJanela(SEGREDO, janelaDe(AGORA) - 1);
    assert.ok(codigoValido(SEGREDO, antigo, AGORA));
  });

  it("RECUSA o código de duas janelas atrás — a foto no grupo envelhece", () => {
    const velho = codigoDaJanela(SEGREDO, janelaDe(AGORA) - 2);
    assert.ok(!codigoValido(SEGREDO, velho, AGORA));
  });

  it("RECUSA o código da janela seguinte", () => {
    /*
      Aceitar a próxima daria 90 segundos de vida a um código, e a foto no
      grupo voltaria a servir. Relógio adiantado é problema de quem o adiantou.
    */
    const futuro = codigoDaJanela(SEGREDO, janelaDe(AGORA) + 1);
    assert.ok(!codigoValido(SEGREDO, futuro, AGORA));
  });

  it("um código de 30 segundos atrás ainda passa; de 90, não", () => {
    const codigo = codigoVigente(SEGREDO, AGORA);

    assert.ok(codigoValido(SEGREDO, codigo, maisSegundos(30)), "30s deveria passar");
    assert.ok(!codigoValido(SEGREDO, codigo, maisSegundos(90)), "90s não pode passar");
  });

  it("recusa código vazio, curto ou inventado", () => {
    for (const ruim of ["", "ABC", "ABCDEF", "ABCDEFG", "!!!!!!"]) {
      assert.ok(!codigoValido(SEGREDO, ruim, AGORA) || ruim === codigoVigente(SEGREDO, AGORA), ruim);
    }
  });

  it("é indiferente a maiúscula e a espaço em volta", () => {
    // Quem digita à mão no celular vai mandar minúscula e um espaço colado.
    const codigo = codigoVigente(SEGREDO, AGORA);
    assert.ok(codigoValido(SEGREDO, ` ${codigo.toLowerCase()} `, AGORA));
  });

  it("o código de outra sessão não vale nesta", () => {
    const outro = codigoVigente("c".repeat(64), AGORA);
    assert.ok(!codigoValido(SEGREDO, outro, AGORA));
  });
});

describe("Estado da sessão", () => {
  const daqui = (min: number) => new Date(AGORA.getTime() + min * 60_000);

  it("aberta enquanto dentro do horário", () => {
    const s = { abertaAte: daqui(60), encerradaEm: null };

    assert.equal(situacaoDaSessao(s, AGORA), "aberta");
    assert.ok(aceitaCheckIn(s, AGORA));
  });

  it("expira quando o horário passa", () => {
    const s = { abertaAte: daqui(-1), encerradaEm: null };

    assert.equal(situacaoDaSessao(s, AGORA), "expirada");
    assert.ok(!aceitaCheckIn(s, AGORA));
  });

  it("encerrada vence expirada", () => {
    /*
      Uma sessão que o instrutor fechou está fechada, tenha ou não passado do
      horário: é o encerramento que grava as conclusões, e ele é um ato.
    */
    const s = { abertaAte: daqui(60), encerradaEm: AGORA };

    assert.equal(situacaoDaSessao(s, AGORA), "encerrada");
    assert.ok(!aceitaCheckIn(s, AGORA));
  });

  it("sem horário-limite segue aberta", () => {
    assert.equal(situacaoDaSessao({ abertaAte: null, encerradaEm: null }, AGORA), "aberta");
  });
});

describe("Da presença para a conclusão", () => {
  it("quem bipou e ainda não tinha conclusão entra", () => {
    const novos = presencasParaConcluir(
      [{ userId: "u1" }, { userId: "u2" }],
      new Set()
    );
    assert.deepEqual(novos, ["u1", "u2"]);
  });

  it("pula quem já tem conclusão naquele treinamento", () => {
    /*
      `ConclusaoExterna` é única por pessoa e curso. Quem fez a brigada ano
      passado e refez agora não pode virar duas linhas — duplicaria a pessoa em
      todo relatório.
    */
    const novos = presencasParaConcluir(
      [{ userId: "u1" }, { userId: "u2" }],
      new Set(["u1"])
    );
    assert.deepEqual(novos, ["u2"]);
  });

  it("não repete quem aparece duas vezes na lista", () => {
    assert.deepEqual(presencasParaConcluir([{ userId: "u1" }, { userId: "u1" }], new Set()), ["u1"]);
  });

  it("lista vazia não gera nada", () => {
    assert.deepEqual(presencasParaConcluir([], new Set()), []);
  });
});
