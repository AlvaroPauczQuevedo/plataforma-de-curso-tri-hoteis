import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  JANELA_PADRAO,
  agruparForaDeHora,
  dentroDoExpediente,
  descreverJanela,
  foraDoExpediente,
  horaLocal,
  janelaConfigurada,
} from "../src/lib/horario-de-trabalho";

/**
 * Treinamento obrigatório fora do horário de trabalho.
 *
 * O que estes testes protegem é o fuso. A hospedagem roda em UTC, e sem a
 * conversão para São Paulo metade do turno da tarde apareceria como estudo de
 * madrugada — o relatório viraria ruído e ninguém o leria.
 */

const ambienteOriginal = { ...process.env };
afterEach(() => {
  process.env = { ...ambienteOriginal };
});

/** Um instante em hora de Brasília (UTC-3), escrito em UTC. */
const emBrasilia = (iso: string) => new Date(`${iso}-03:00`);

describe("Conversão de fuso", () => {
  it("14h de Brasília é 14h, não 17h", () => {
    assert.equal(horaLocal(emBrasilia("2026-09-16T14:00:00")).hora, 14);
  });

  it("21h de uma quarta continua quarta, e não vira quinta de madrugada", () => {
    /*
      Este é o caso que motivou o módulo: 21h em Brasília é meia-noite em UTC.
      Sem a conversão, o turno da tarde inteiro cairia no relatório.
    */
    const { hora, diaDaSemana } = horaLocal(emBrasilia("2026-09-16T21:00:00"));

    assert.equal(hora, 21);
    assert.equal(diaDaSemana, 3, "quarta-feira");
  });

  it("identifica domingo corretamente", () => {
    assert.equal(horaLocal(emBrasilia("2026-09-20T10:00:00")).diaDaSemana, 0);
  });
});

describe("Dentro e fora do expediente", () => {
  it("terça às 10h está dentro", () => {
    assert.ok(dentroDoExpediente(emBrasilia("2026-09-15T10:00:00")));
  });

  it("terça às 23h está fora", () => {
    assert.ok(foraDoExpediente(emBrasilia("2026-09-15T23:00:00")));
  });

  it("terça às 5h está fora", () => {
    assert.ok(foraDoExpediente(emBrasilia("2026-09-15T05:00:00")));
  });

  it("domingo ao meio-dia está fora", () => {
    assert.ok(foraDoExpediente(emBrasilia("2026-09-20T12:00:00")));
  });

  it("sábado às 10h está DENTRO — hotel funciona no sábado", () => {
    assert.ok(dentroDoExpediente(emBrasilia("2026-09-19T10:00:00")));
  });

  it("o fim é exclusivo: 21h59 dentro, 22h fora", () => {
    assert.ok(dentroDoExpediente(emBrasilia("2026-09-15T21:59:00")));
    assert.ok(foraDoExpediente(emBrasilia("2026-09-15T22:00:00")));
  });
});

describe("Janela configurável", () => {
  it("usa o padrão sem configuração", () => {
    delete process.env.EXPEDIENTE_INICIO;
    delete process.env.EXPEDIENTE_FIM;

    assert.deepEqual(janelaConfigurada(), JANELA_PADRAO);
  });

  it("aceita janela do ambiente", () => {
    process.env.EXPEDIENTE_INICIO = "8";
    process.env.EXPEDIENTE_FIM = "18";

    const janela = janelaConfigurada();
    assert.equal(janela.inicio, 8);
    assert.equal(janela.fim, 18);
  });

  it("recusa janela invertida e volta ao padrão", () => {
    /*
      Início depois do fim daria uma janela vazia, e TUDO cairia no relatório —
      que é o pior desfecho: o relatório perde o sentido e ninguém percebe.
    */
    process.env.EXPEDIENTE_INICIO = "22";
    process.env.EXPEDIENTE_FIM = "6";

    assert.deepEqual(janelaConfigurada(), JANELA_PADRAO);
  });

  it("recusa valor absurdo", () => {
    for (const ruim of ["99", "-1", "abc", ""]) {
      process.env.EXPEDIENTE_INICIO = ruim;
      assert.equal(janelaConfigurada().inicio, JANELA_PADRAO.inicio, ruim);
    }
  });

  it("a descrição diz o horário em texto", () => {
    delete process.env.EXPEDIENTE_INICIO;
    delete process.env.EXPEDIENTE_FIM;

    const texto = descreverJanela();
    assert.match(texto, /segunda a sábado/);
    assert.match(texto, /6h/);
    assert.match(texto, /22h/);
  });
});

describe("Agrupamento do relatório", () => {
  const nomes = new Map([
    ["u1", "Marina Costa"],
    ["u2", "João Pereira"],
  ]);
  const quando = (iso: string) => emBrasilia(iso);

  it("junta as ocorrências da mesma pessoa numa linha", () => {
    // A ação do RH é uma conversa: doze registros da mesma pessoa é um assunto.
    const linhas = agruparForaDeHora(
      [
        { userId: "u1", quando: quando("2026-09-15T23:00:00"), curso: "Brigada" },
        { userId: "u1", quando: quando("2026-09-16T23:30:00"), curso: "Brigada" },
      ],
      nomes
    );

    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].ocorrencias, 2);
    assert.equal(linhas[0].nome, "Marina Costa");
  });

  it("guarda a ocorrência MAIS RECENTE", () => {
    const linhas = agruparForaDeHora(
      [
        { userId: "u1", quando: quando("2026-09-10T23:00:00"), curso: "A" },
        { userId: "u1", quando: quando("2026-09-16T23:00:00"), curso: "A" },
      ],
      nomes
    );

    assert.equal(linhas[0].ultima.toISOString(), quando("2026-09-16T23:00:00").toISOString());
  });

  it("não repete o mesmo curso na lista", () => {
    const linhas = agruparForaDeHora(
      [
        { userId: "u1", quando: quando("2026-09-15T23:00:00"), curso: "Brigada" },
        { userId: "u1", quando: quando("2026-09-16T23:00:00"), curso: "Brigada" },
      ],
      nomes
    );

    assert.deepEqual(linhas[0].cursos, ["Brigada"]);
  });

  it("quem tem mais ocorrências vem primeiro", () => {
    /*
      Padrão custa caro; um registro isolado às 22h05 é alguém terminando a
      aula. A ordem precisa refletir isso, senão o RH começa pelo caso menor.
    */
    const linhas = agruparForaDeHora(
      [
        { userId: "u2", quando: quando("2026-09-16T23:00:00"), curso: "A" },
        { userId: "u1", quando: quando("2026-09-15T23:00:00"), curso: "A" },
        { userId: "u1", quando: quando("2026-09-14T23:00:00"), curso: "A" },
      ],
      nomes
    );

    assert.equal(linhas[0].userId, "u1");
    assert.equal(linhas[0].ocorrencias, 2);
  });

  it("pessoa sem nome conhecido não quebra a linha", () => {
    const linhas = agruparForaDeHora(
      [{ userId: "fantasma", quando: quando("2026-09-15T23:00:00"), curso: "A" }],
      nomes
    );

    assert.equal(linhas[0].nome, "—");
  });

  it("lista vazia devolve nada", () => {
    assert.deepEqual(agruparForaDeHora([], nomes), []);
  });
});
