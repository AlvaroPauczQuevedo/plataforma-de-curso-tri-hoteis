import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  limiteDe,
  regrasDeRetencao,
  resumoDaRetencao,
  retencaoAtiva,
  type RelatorioDeRetencao,
} from "../src/lib/retencao";

/**
 * A retenção de dados pessoais.
 *
 * O que estes testes protegem é o modo seguro: apagar dado é irreversível, e o
 * prazo de cada tipo é decisão jurídica. Se o expurgo ligar sozinho por um
 * descuido de configuração, a plataforma destrói prova de treinamento sem
 * ninguém pedir.
 */

const AGORA = new Date("2026-09-18T12:00:00Z");

const ambienteOriginal = { ...process.env };
afterEach(() => {
  process.env = { ...ambienteOriginal };
});

describe("A chave de segurança", () => {
  it("está DESLIGADA quando não configurada", () => {
    delete process.env.RETENCAO_ATIVA;
    assert.equal(retencaoAtiva(), false);
  });

  it("só liga com exatamente 'true'", () => {
    /*
      Nada de aceitar "1", "sim" ou "TRUE". Esta chave autoriza apagar dado
      pessoal em definitivo; ser exigente aqui é o barato.
    */
    for (const valor of ["1", "sim", "yes", "TRUE", "True", ""]) {
      process.env.RETENCAO_ATIVA = valor;
      assert.equal(retencaoAtiva(), false, `"${valor}" não deveria ligar`);
    }

    process.env.RETENCAO_ATIVA = "true";
    assert.equal(retencaoAtiva(), true);
  });
});

describe("Prazos", () => {
  it("usa os padrões quando o ambiente não diz nada", () => {
    delete process.env.RETENCAO_ACESSO_DIAS;
    delete process.env.RETENCAO_ATIVIDADE_DIAS;
    delete process.env.RETENCAO_IP_DIAS;

    const [acesso, atividade, ip] = regrasDeRetencao();

    assert.equal(acesso.dias, 180, "Marco Civil, Art. 15");
    assert.equal(atividade.dias, 1825, "5 anos de trilha administrativa");
    assert.equal(ip.dias, 180);
  });

  it("aceita prazo do ambiente", () => {
    process.env.RETENCAO_ACESSO_DIAS = "90";
    assert.equal(regrasDeRetencao()[0].dias, 90);
  });

  it("IGNORA prazo inválido e volta ao padrão", () => {
    /*
      Zero, negativo ou texto apagariam tudo, ou desligariam o prazo em
      silêncio. Num mecanismo destrutivo, entrada ruim tem de cair no valor
      seguro, nunca no permissivo.
    */
    for (const ruim of ["0", "-30", "abc", "30.5", ""]) {
      process.env.RETENCAO_ACESSO_DIAS = ruim;
      assert.equal(regrasDeRetencao()[0].dias, 180, `"${ruim}" deveria cair no padrão`);
    }
  });

  it("o IP é anonimizado, não apagado", () => {
    // O aceite e a presença são prova de conformidade: o registro fica, o IP sai.
    const [, , ipAceite, ipPresenca] = regrasDeRetencao();

    assert.equal(ipAceite.acao, "anonimizar");
    assert.equal(ipPresenca.acao, "anonimizar");
  });

  it("toda regra explica o próprio prazo", () => {
    // O relatório é lido por quem não escreveu o código — inclusive o jurídico.
    for (const regra of regrasDeRetencao()) {
      assert.ok(regra.porque.length > 10, regra.nome);
    }
  });
});

describe("Data-limite", () => {
  it("volta o número de dias pedido", () => {
    assert.equal(limiteDe(AGORA, 180).toISOString(), "2026-03-22T12:00:00.000Z");
  });

  it("prazo maior devolve data mais antiga", () => {
    assert.ok(limiteDe(AGORA, 1825) < limiteDe(AGORA, 180));
  });
});

describe("Resumo do relatório", () => {
  const relatorio = (ativa: boolean, total: number): RelatorioDeRetencao => ({
    quando: AGORA,
    ativa,
    linhas: [],
    totalAlcancado: total,
  });

  it("em simulação, diz em letras que NADA foi tocado", () => {
    /*
      O pior desfecho aqui é alguém ler o log, ver "120 registros" e concluir
      que o expurgo está funcionando quando ele nunca rodou.
    */
    const texto = resumoDaRetencao(relatorio(false, 120));

    assert.match(texto, /120 registro/);
    assert.match(texto, /nada foi tocado/i);
    assert.match(texto, /RETENCAO_ATIVA/);
  });

  it("ligado, relata o que foi expurgado", () => {
    const texto = resumoDaRetencao(relatorio(true, 120));

    assert.match(texto, /120 registro/);
    assert.ok(!/nada foi tocado/i.test(texto));
  });

  it("sem nada vencido, ainda distingue os dois modos", () => {
    assert.ok(!/simulação/i.test(resumoDaRetencao(relatorio(true, 0))));
    assert.match(resumoDaRetencao(relatorio(false, 0)), /simulação/i);
  });
});
