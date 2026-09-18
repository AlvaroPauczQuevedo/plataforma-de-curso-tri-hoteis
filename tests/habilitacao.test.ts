import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TERMO_DE_HABILITACAO,
  avisoDeHabilitacao,
  habilitacaoSustentaPublicacao,
  motivoParaNaoPublicar,
  situacaoDaHabilitacao,
} from "../src/lib/habilitacao";

/**
 * A habilitação do instrutor.
 *
 * O que estes testes protegem: que um treinamento que exige instrutor
 * habilitado não vá ao ar sem comprovante. Se essa trava falhar, a plataforma
 * passa a emitir certificado afirmando um treinamento que pode não se
 * sustentar — e o erro só aparece quando a fiscalização cobra.
 */

const AGORA = new Date("2026-09-18T12:00:00Z");
const emDias = (n: number) => new Date(AGORA.getTime() + n * 864e5);

const EXIGE = { exigeInstrutorHabilitado: true };
const NAO_EXIGE = { exigeInstrutorHabilitado: false };

describe("Situação do comprovante", () => {
  it("vigente enquanto a validade não passou", () => {
    assert.equal(situacaoDaHabilitacao({ validoAte: emDias(30) }, AGORA), "valida");
  });

  it("vencido depois da validade", () => {
    assert.equal(situacaoDaHabilitacao({ validoAte: emDias(-1) }, AGORA), "vencida");
  });

  it("sem validade declarada NÃO é o mesmo que válido para sempre", () => {
    /*
      Certificado de instrutor e registro profissional costumam vencer. Tratar
      a ausência de data como "vale sempre" transformaria esquecimento em
      permissão eterna — então tem estado próprio, e a tela o destaca.
    */
    assert.equal(situacaoDaHabilitacao({ validoAte: null }, AGORA), "sem_validade");
  });
});

describe("O que sustenta publicação", () => {
  it("vigente sustenta", () => {
    assert.ok(habilitacaoSustentaPublicacao({ validoAte: emDias(1) }, AGORA));
  });

  it("vencido NÃO sustenta", () => {
    assert.ok(!habilitacaoSustentaPublicacao({ validoAte: emDias(-1) }, AGORA));
  });

  it("sem validade sustenta, mas com ressalva", () => {
    // Recusar travaria comprovante legítimo que de fato não tem prazo.
    assert.ok(habilitacaoSustentaPublicacao({ validoAte: null }, AGORA));
  });
});

describe("Trava de publicação", () => {
  it("curso que NÃO exige habilitação publica sem comprovante", () => {
    assert.equal(motivoParaNaoPublicar(NAO_EXIGE, [], AGORA), null);
  });

  it("curso que exige, SEM comprovante, é barrado", () => {
    const motivo = motivoParaNaoPublicar(EXIGE, [], AGORA);

    assert.ok(motivo);
    assert.match(motivo, /comprovante/i);
  });

  it("curso que exige, com comprovante VENCIDO, é barrado", () => {
    const motivo = motivoParaNaoPublicar(EXIGE, [{ validoAte: emDias(-1) }], AGORA);

    assert.ok(motivo);
    assert.match(motivo, /vencido/i);
  });

  it("curso que exige, com comprovante vigente, publica", () => {
    assert.equal(motivoParaNaoPublicar(EXIGE, [{ validoAte: emDias(30) }], AGORA), null);
  });

  it("basta UM vigente entre vários vencidos", () => {
    // Trocar o instrutor não deve exigir apagar o comprovante do anterior.
    const habilitacoes = [{ validoAte: emDias(-100) }, { validoAte: emDias(10) }];
    assert.equal(motivoParaNaoPublicar(EXIGE, habilitacoes, AGORA), null);
  });

  it("a mensagem distingue 'não tem' de 'venceu'", () => {
    /*
      Ações diferentes: num caso anexar o que falta, no outro renovar o que
      existe. Mensagem genérica faria alguém anexar de novo o mesmo papel
      vencido.
    */
    const semNada = motivoParaNaoPublicar(EXIGE, [], AGORA)!;
    const vencido = motivoParaNaoPublicar(EXIGE, [{ validoAte: emDias(-1) }], AGORA)!;

    assert.notEqual(semNada, vencido);
  });
});

describe("Aviso em curso já publicado", () => {
  const publicadoExigindo = { exigeInstrutorHabilitado: true, publicado: true };

  it("não avisa quando está tudo certo", () => {
    assert.equal(avisoDeHabilitacao(publicadoExigindo, [{ validoAte: emDias(30) }], AGORA), null);
  });

  it("avisa quando o comprovante venceu DEPOIS de publicado", () => {
    /*
      Não despublica sozinho: tirar o treinamento do ar no meio de uma turma é
      decisão de quem responde pelo curso, não efeito colateral de uma data.
    */
    const aviso = avisoDeHabilitacao(publicadoExigindo, [{ validoAte: emDias(-1) }], AGORA);

    assert.ok(aviso);
    assert.match(aviso, /VENCEU/);
  });

  it("avisa quando está publicado sem nenhum comprovante", () => {
    const aviso = avisoDeHabilitacao(publicadoExigindo, [], AGORA);

    assert.ok(aviso);
    assert.match(aviso, /SEM comprovante/);
  });

  it("pede conferência quando não há validade declarada", () => {
    const aviso = avisoDeHabilitacao(publicadoExigindo, [{ validoAte: null }], AGORA);

    assert.ok(aviso);
    assert.match(aviso, /validade/i);
  });

  it("rascunho não avisa — ainda não afirma nada a ninguém", () => {
    const rascunho = { exigeInstrutorHabilitado: true, publicado: false };
    assert.equal(avisoDeHabilitacao(rascunho, [], AGORA), null);
  });

  it("curso que não exige habilitação nunca avisa", () => {
    const outro = { exigeInstrutorHabilitado: false, publicado: true };
    assert.equal(avisoDeHabilitacao(outro, [], AGORA), null);
  });
});

describe("Termo de responsabilidade", () => {
  it("diz que a responsabilidade é de quem declara, e em quais esferas", () => {
    /*
      É o texto que transforma "a empresa não sabia" numa declaração pessoal.
      Se ele for vago, não sustenta nada.
    */
    assert.match(TERMO_DE_HABILITACAO, /minha inteira responsabilidade/i);
    assert.match(TERMO_DE_HABILITACAO, /civil/i);
    assert.match(TERMO_DE_HABILITACAO, /penal/i);
    assert.match(TERMO_DE_HABILITACAO, /fiscal/i);
  });

  it("avisa que o próprio registro é a prova", () => {
    assert.match(TERMO_DE_HABILITACAO, /nome, data e/i);
  });

  it("afirma autenticidade E vigência — as duas coisas", () => {
    assert.match(TERMO_DE_HABILITACAO, /autêntico/i);
    assert.match(TERMO_DE_HABILITACAO, /vigente/i);
  });
});
