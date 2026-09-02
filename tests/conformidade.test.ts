import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIAS_DE_ALERTA,
  resumirObrigacoes,
  situacaoDaObrigacao,
  type Obrigacao,
} from "../src/lib/conformidade";
import { emailDeConformidade } from "../src/lib/email";

/**
 * A conta que diz quem está em dia.
 *
 * Ela existe em dois lugares agora — a tela e o resumo semanal por e-mail — e a
 * razão de morar num módulo só é que as duas precisam concordar. Uma tela
 * dizendo doze atrasados e um e-mail dizendo nove é pior do que não ter o
 * e-mail: ninguém sabe qual vale, e é numa auditoria que se descobre.
 *
 * Nada aqui toca o banco: entra um percentual, um prazo e um relógio.
 */

const AGORA = new Date("2026-06-15T12:00:00Z");
const emDias = (n: number) => new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000);

describe("Situação de uma obrigação", () => {
  it("concluído está em dia, mesmo com o prazo vencido", () => {
    /*
      O relatório responde "o que falta fazer", não "quem cumpriu o
      cronograma". Quem terminou não pode aparecer na lista de cobrança só
      porque terminou tarde.
    */
    const r = situacaoDaObrigacao({ percent: 100, dueDate: emDias(-30), agora: AGORA });

    assert.equal(r.situacao, "em_dia");
    assert.equal(r.concluido, true);
  });

  it("prazo vencido sem concluir é atraso", () => {
    const r = situacaoDaObrigacao({ percent: 40, dueDate: emDias(-1), agora: AGORA });

    assert.equal(r.situacao, "atrasado");
    assert.ok(r.diasRestantes !== null && r.diasRestantes < 0);
  });

  it("dentro da janela de alerta está vencendo", () => {
    for (const dias of [1, 3, DIAS_DE_ALERTA]) {
      const r = situacaoDaObrigacao({ percent: 0, dueDate: emDias(dias), agora: AGORA });
      assert.equal(r.situacao, "vencendo", `faltando ${dias} dia(s)`);
    }
  });

  it("além da janela de alerta é só pendente", () => {
    const r = situacaoDaObrigacao({
      percent: 0,
      dueDate: emDias(DIAS_DE_ALERTA + 1),
      agora: AGORA,
    });

    assert.equal(r.situacao, "pendente");
  });

  it("sem prazo é pendente, nunca atrasado", () => {
    // Sem data combinada não há o que vencer; cobrar seria inventar um prazo.
    const r = situacaoDaObrigacao({ percent: 0, dueDate: null, agora: AGORA });

    assert.equal(r.situacao, "pendente");
    assert.equal(r.diasRestantes, null);
  });

  it("o dia do vencimento ainda conta como vencendo, não como atraso", () => {
    // A borda que decide se alguém é cobrado indevidamente no último dia.
    const r = situacaoDaObrigacao({
      percent: 50,
      dueDate: new Date(AGORA.getTime() + 60 * 1000),
      agora: AGORA,
    });

    assert.equal(r.situacao, "vencendo");
  });

  it("progresso parcial não conclui", () => {
    const r = situacaoDaObrigacao({ percent: 99, dueDate: emDias(-1), agora: AGORA });
    assert.equal(r.situacao, "atrasado");
  });
});

describe("Resumo", () => {
  const linha = (situacao: Obrigacao["situacao"]): Obrigacao => ({
    id: `x${Math.random()}`,
    userId: "u",
    courseId: "c",
    dueDate: null,
    percent: 0,
    concluido: situacao === "em_dia",
    diasRestantes: null,
    situacao,
  });

  it("as parcelas somam o total", () => {
    const linhas = [
      linha("em_dia"),
      linha("em_dia"),
      linha("atrasado"),
      linha("vencendo"),
      linha("pendente"),
    ];

    const r = resumirObrigacoes(linhas);

    assert.equal(r.total, 5);
    assert.equal(r.em_dia, 2);
    assert.equal(r.atrasado, 1);
    assert.equal(r.vencendo, 1);
    assert.equal(r.pendente, 1);
    assert.equal(r.em_dia + r.atrasado + r.vencendo + r.pendente, r.total);
  });

  it("lista vazia devolve tudo zerado", () => {
    assert.deepEqual(resumirObrigacoes([]), {
      total: 0,
      em_dia: 0,
      vencendo: 0,
      atrasado: 0,
      pendente: 0,
    });
  });
});

describe("O e-mail do resumo", () => {
  it("não existe quando não há nada a cobrar", () => {
    /*
      A decisão que mantém o aviso legível. Um resumo semanal que chega dizendo
      "está tudo bem" ensina quem recebe a arquivá-lo sem ler — e aí o da
      semana que importa vai junto.
    */
    assert.equal(emailDeConformidade({ atrasados: 0, vencendo: 0, porSetor: [] }), null);
  });

  it("sai quando há atraso", () => {
    const m = emailDeConformidade({
      atrasados: 3,
      vencendo: 0,
      porSetor: [{ departamento: "Recepção", atrasado: 3, vencendo: 0 }],
    });

    assert.ok(m);
    assert.match(m.assunto, /3 treinamento/);
    assert.match(m.texto, /Recepção: 3 atrasado/);
  });

  it("sai quando só há vencimento próximo", () => {
    const m = emailDeConformidade({
      atrasados: 0,
      vencendo: 2,
      porSetor: [{ departamento: "Governança", atrasado: 0, vencendo: 2 }],
    });

    assert.ok(m);
    assert.match(m.assunto, /vencendo/);
  });

  it("o destinatário fica em branco: quem envia decide para quem", () => {
    const m = emailDeConformidade({ atrasados: 1, vencendo: 0, porSetor: [] });
    assert.equal(m?.para, "");
  });

  it("aponta para a tela onde está a lista nominal", () => {
    const m = emailDeConformidade({ atrasados: 1, vencendo: 0, porSetor: [] });
    assert.ok(m);
    assert.match(m.texto, /\/admin\/conformidade/);
  });
});
