import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

/*
  ANTES do alarme: ele grava no registro de erros e conta o teto ao lado dele, e
  sem o desvio as duas coisas cairiam dentro do projeto.
*/
import { PASTA_DE_ERROS, limparPastaDeErros } from "./erros-temporarios";

import { dispararAlarmeDaIsca, ehIsca } from "../src/lib/alarme-da-isca";
import { ISCA_SENHA, ISCA_USUARIO } from "../src/lib/isca-de-console";
import { limparHistoricoDeAvisos } from "../src/lib/monitoramento";
import { motivoDeNomeInvalido, normalizarNomeDeUsuario } from "../src/lib/nome-de-usuario";
import { SENHA_MINIMA } from "../src/lib/regra-de-senha";

after(limparPastaDeErros);

/**
 * A isca do console: credencial falsa na tela de login que, usada, vira alarme.
 *
 * O que estes testes protegem são as garantias que tornam a piada segura:
 * nenhuma conta real pode ter aquele nome, a senha digitada nunca é gravada, e
 * quem martelar a isca não consegue lotar o registro de erros.
 */

/** Tudo que o registro de erros tem, como texto. */
function registro(): string {
  try {
    return readdirSync(PASTA_DE_ERROS)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => readFileSync(path.join(PASTA_DE_ERROS, n), "utf8"))
      .join("");
  } catch {
    return "";
  }
}

beforeEach(() => {
  // O teto conta num arquivo compartilhado entre execuções; cada teste diz o
  // seu, lido pelo alarme a cada chamada.
  process.env.ISCA_TETO_POR_HORA = "1000000";
  limparHistoricoDeAvisos();
});

describe("Reconhecer a isca", () => {
  it("vale do jeito que o login recebe o nome, já normalizado", () => {
    // O celular capitaliza a primeira letra e o teclado põe acento sozinho.
    assert.equal(ehIsca(normalizarNomeDeUsuario("  Suporte Contingência ")), true);
    assert.equal(ehIsca(ISCA_USUARIO), true);
  });

  it("nome de gente não é isca", () => {
    assert.equal(ehIsca("maria.silva"), false);
    assert.equal(ehIsca("suporte"), false);
    assert.equal(ehIsca("suporte.contingencia2"), false);
  });
});

describe("Nenhuma conta real pode ser a isca", () => {
  it("o cadastro recusa o nome da isca", () => {
    /*
      Uma conta real com esse nome desligaria o alarme — ele só dispara quando a
      conta não existe — e poria uma pessoa de verdade atrás da credencial que o
      console oferece a quem procura brecha.
    */
    assert.match(motivoDeNomeInvalido(ISCA_USUARIO) ?? "", /reservado/);
  });

  it("e a reserva não pega nomes parecidos", () => {
    assert.equal(motivoDeNomeInvalido("suporte.ti"), null);
    assert.equal(motivoDeNomeInvalido("contingencia"), null);
  });
});

describe("Parecer de verdade", () => {
  it("a senha falsa passaria na regra de senha da própria plataforma", () => {
    // Uma senha que a plataforma recusaria entregaria que é encenação.
    assert.ok(ISCA_SENHA.length >= SENHA_MINIMA);
  });

  it("não tem formato de chave que scanner de segredo reconheça", () => {
    // Evita alerta falso do GitHub e do gitleaks contra o próprio repositório.
    const formatosReais = [/^AKIA/, /^sk_(live|test)_/, /^gh[pousr]_/, /^eyJ/, /^xox[baprs]-/];
    for (const valor of [ISCA_USUARIO, ISCA_SENHA]) {
      for (const formato of formatosReais) {
        assert.doesNotMatch(valor, formato);
      }
    }
  });
});

describe("O alarme", () => {
  it("registra a origem da tentativa", async () => {
    await dispararAlarmeDaIsca({ ip: "203.0.113.77", senha: "chute-qualquer-123" });

    const texto = registro();
    assert.match(texto, /mordeu a isca/);
    assert.match(texto, /203\.0\.113\.77/);
    assert.match(texto, /com outra senha/);
  });

  it("NUNCA grava a senha que foi digitada", async () => {
    /*
      Se quem digitou fosse um funcionário curioso, o texto seria a senha
      verdadeira dele — e o registro de erros não é lugar de senha em claro.
    */
    const digitada = "SenhaQueNaoPodeAparecer@987";
    await dispararAlarmeDaIsca({ ip: "203.0.113.78", senha: digitada });

    assert.doesNotMatch(registro(), new RegExp(digitada));
  });

  it("diz quando a pessoa copiou a credencial inteira do console", async () => {
    await dispararAlarmeDaIsca({ ip: "203.0.113.79", senha: ISCA_SENHA });

    const linha = registro()
      .split("\n")
      .find((l) => l.includes("203.0.113.79"));
    assert.ok(linha, "a tentativa foi registrada");
    assert.match(linha, /senha falsa inteira/);
    // E nem a senha FALSA vai para o registro: basta dizer que era ela.
    assert.doesNotMatch(linha, new RegExp(ISCA_SENHA.replace(/[.*+?^${}()|[\]\\#@]/g, "\\$&")));
  });

  it("acima do teto, se cala em vez de lotar o registro", async () => {
    process.env.ISCA_TETO_POR_HORA = "0";

    await dispararAlarmeDaIsca({ ip: "198.51.100.200", senha: "x" });

    assert.doesNotMatch(registro(), /198\.51\.100\.200/);
  });

  it("nunca lança, nem com entrada estranha", async () => {
    // O alarme roda dentro do login: uma falha dele não pode virar falha de login.
    await assert.doesNotReject(
      dispararAlarmeDaIsca({ ip: "", senha: undefined as unknown as string })
    );
  });
});
