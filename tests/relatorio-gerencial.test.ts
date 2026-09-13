import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEM_GRUPO,
  chaveDoMes,
  consolidarPorGrupo,
  distribuirPorMes,
  inicioDaBusca,
  janelaDeMeses,
  ordenarPorRisco,
  pessoasComPendencia,
  taxaDeConformidade,
  type LinhaDoGrupo,
} from "../src/lib/relatorio-gerencial";
import type { Obrigacao } from "../src/lib/conformidade";

/**
 * A consolidação do painel. Nada aqui toca o banco: entram pessoas e
 * obrigações, sai a tabela que o diretor lê.
 *
 * O que estes testes protegem é a leitura da tabela. Um número certo na ordem
 * errada, ou um hotel que some por não ter pendência, faz alguém cobrar a casa
 * errada — que é o custo real de um painel gerencial defeituoso.
 */

const pessoa = (id: string, grupoId: string | null, grupoNome: string | null = grupoId) => ({
  id,
  grupoId,
  grupoNome,
});

const obrigacao = (userId: string, situacao: Obrigacao["situacao"]) => ({ userId, situacao });

describe("Taxa de conformidade", () => {
  it("é a fatia em dia do total", () => {
    assert.equal(taxaDeConformidade({ total: 4, em_dia: 3 }), 75);
  });

  it("sem obrigação nenhuma é NULO, não 100%", () => {
    /*
      Um hotel onde ninguém atribuiu treinamento não está em dia: está sem
      medida. Exibir 100% ali premiaria justamente a casa onde nada foi
      cadastrado, e ela subiria ao topo do ranking de melhores.
    */
    assert.equal(taxaDeConformidade({ total: 0, em_dia: 0 }), null);
  });
});

describe("Consolidação por grupo", () => {
  const pessoas = [
    pessoa("u1", "h1", "Canela"),
    pessoa("u2", "h1", "Canela"),
    pessoa("u3", "h2", "Gramado"),
  ];

  it("conta as pessoas e as situações de cada grupo", () => {
    const linhas = consolidarPorGrupo(pessoas, [
      obrigacao("u1", "atrasado"),
      obrigacao("u2", "em_dia"),
      obrigacao("u3", "em_dia"),
    ]);

    const canela = linhas.find((l) => l.nome === "Canela")!;
    assert.equal(canela.pessoas, 2);
    assert.equal(canela.obrigacoes, 2);
    assert.equal(canela.atrasado, 1);
    assert.equal(canela.taxa, 50);
  });

  it("um grupo SEM pendência continua na tabela", () => {
    /*
      Se a consolidação partisse das obrigações, o hotel onde ninguém tem
      treinamento atribuído sumiria — e sumir é o mesmo que passar
      despercebido, que é exatamente o problema que o painel resolve.
    */
    const linhas = consolidarPorGrupo(pessoas, [obrigacao("u1", "atrasado")]);
    const gramado = linhas.find((l) => l.nome === "Gramado");

    assert.ok(gramado, "o hotel sem obrigação sumiu da tabela");
    assert.equal(gramado.pessoas, 1);
    assert.equal(gramado.obrigacoes, 0);
    assert.equal(gramado.taxa, null);
  });

  it("quem não tem vínculo cai num grupo próprio, e não some", () => {
    const linhas = consolidarPorGrupo([pessoa("u9", null, null)], [obrigacao("u9", "atrasado")]);

    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].nome, SEM_GRUPO);
    assert.equal(linhas[0].grupoId, null);
  });

  it("ignora obrigação de quem não está na lista de pessoas", () => {
    /*
      Conta desativada ou administrador. Somá-la a um grupo inventado faria a
      tabela deixar de bater com o total da rede.
    */
    const linhas = consolidarPorGrupo(pessoas, [
      obrigacao("u1", "atrasado"),
      obrigacao("fantasma", "atrasado"),
    ]);

    const total = linhas.reduce((s, l) => s + l.obrigacoes, 0);
    assert.equal(total, 1);
  });

  it("conta pelo vínculo principal: a soma das pessoas fecha com o total", () => {
    // Quem atende duas casas contando nas duas faria a soma passar do total de
    // funcionários — número que não se defende em auditoria.
    const linhas = consolidarPorGrupo(pessoas, []);
    assert.equal(
      linhas.reduce((s, l) => s + l.pessoas, 0),
      pessoas.length
    );
  });
});

describe("Ordem do ranking", () => {
  const linha = (nome: string, atrasado: number, vencendo: number, taxa: number | null): LinhaDoGrupo => ({
    grupoId: nome,
    nome,
    pessoas: 1,
    obrigacoes: taxa === null ? 0 : 10,
    em_dia: 0,
    vencendo,
    atrasado,
    pendente: 0,
    taxa,
  });

  it("o pior primeiro: atraso pesa mais que vencendo", () => {
    const ordenadas = ordenarPorRisco([
      linha("Vencendo", 0, 9, 50),
      linha("Atrasado", 1, 0, 50),
    ]);

    assert.equal(ordenadas[0].nome, "Atrasado");
  });

  it("empatado em atraso, decide o que está vencendo", () => {
    const ordenadas = ordenarPorRisco([linha("A", 2, 1, 50), linha("B", 2, 5, 50)]);
    assert.equal(ordenadas[0].nome, "B");
  });

  it("grupo sem medida vai para o FIM, não para o topo", () => {
    /*
      Sem obrigação nenhuma ele tem zero atraso, e uma ordenação ingênua o
      colocaria entre os melhores da rede. Ele não é o melhor: é o que ninguém
      mediu, e inverter isso inverte a leitura inteira da tabela.
    */
    const ordenadas = ordenarPorRisco([
      linha("Sem medida", 0, 0, null),
      linha("Em dia", 0, 0, 100),
    ]);

    assert.equal(ordenadas.at(-1)!.nome, "Sem medida");
  });

  it("empatado em tudo, decide a taxa mais baixa", () => {
    const ordenadas = ordenarPorRisco([linha("Boa", 0, 0, 90), linha("Ruim", 0, 0, 40)]);
    assert.equal(ordenadas[0].nome, "Ruim");
  });
});

describe("Pessoas com pendência", () => {
  it("conta gente, não obrigações", () => {
    /*
      "137 obrigações atrasadas" e "42 pessoas devendo" são números muito
      diferentes para quem vai cobrar. O painel mostra o segundo.
    */
    const total = pessoasComPendencia([
      obrigacao("u1", "atrasado"),
      obrigacao("u1", "vencendo"),
      obrigacao("u1", "pendente"),
      obrigacao("u2", "em_dia"),
    ]);

    assert.equal(total, 1);
  });

  it("quem só tem obrigação em dia não conta", () => {
    assert.equal(pessoasComPendencia([obrigacao("u1", "em_dia")]), 0);
  });
});

describe("Série mensal", () => {
  const AGORA = new Date("2026-09-12T15:00:00Z");

  it("a janela termina no mês corrente e anda para trás pelo calendário", () => {
    const meses = janelaDeMeses(AGORA, 6);

    assert.equal(meses.length, 6);
    assert.equal(meses.at(-1)!.chave, "2026-09");
    assert.equal(meses[0].chave, "2026-04");
  });

  it("vira o ano corretamente", () => {
    // Somar "30 dias" seis vezes não chega em janeiro; andar de mês, sim.
    const meses = janelaDeMeses(new Date("2026-02-10T12:00:00Z"), 4);
    assert.deepEqual(
      meses.map((m) => m.chave),
      ["2025-11", "2025-12", "2026-01", "2026-02"]
    );
  });

  it("o rótulo é curto, para caber no eixo", () => {
    assert.equal(janelaDeMeses(AGORA, 1)[0].rotulo, "set/26");
  });

  it("o mês é o de São Paulo, e não o do servidor em UTC", () => {
    /*
      Um certificado emitido em 31/08 às 22h no Brasil é 01/09 em UTC. Sem a
      conversão ele cairia no mês seguinte, e o mês que acabou de fechar
      fecharia com o número errado.
    */
    assert.equal(chaveDoMes(new Date("2026-09-01T01:00:00Z")), "2026-08");
  });

  it("distribui as conclusões separando plataforma de presencial", () => {
    const meses = janelaDeMeses(AGORA, 2); // ago/26 e set/26
    const serie = distribuirPorMes(
      [
        { em: new Date("2026-08-10T12:00:00Z"), origem: "plataforma" },
        { em: new Date("2026-09-02T12:00:00Z"), origem: "plataforma" },
        { em: new Date("2026-09-05T12:00:00Z"), origem: "externa" },
      ],
      meses
    );

    assert.deepEqual(
      serie.map((m) => [m.chave, m.plataforma, m.externas, m.total]),
      [
        ["2026-08", 1, 0, 1],
        ["2026-09", 1, 1, 2],
      ]
    );
  });

  it("descarta em silêncio o que cai fora da janela", () => {
    // A consulta busca com folga para não perder a borda do fuso; é aqui que a
    // folga é aparada.
    const meses = janelaDeMeses(AGORA, 1);
    const serie = distribuirPorMes([{ em: new Date("2020-01-01T12:00:00Z"), origem: "plataforma" }], meses);

    assert.equal(serie[0].total, 0);
  });

  it("a busca começa antes do primeiro mês, para cobrir o fuso", () => {
    const meses = janelaDeMeses(AGORA, 6); // começa em abr/26
    const desde = inicioDaBusca(meses);

    assert.ok(desde < new Date("2026-04-01T00:00:00Z"), desde.toISOString());
    assert.ok(desde > new Date("2026-03-29T00:00:00Z"), desde.toISOString());
  });
});
