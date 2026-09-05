import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatarTelefone,
  linkDeWhatsApp,
  mensagemDeCredencial,
  mensagemDeLembrete,
  mensagemDePrazo,
  motivoDeTelefoneInvalido,
  normalizarTelefone,
} from "../src/lib/whatsapp";

/**
 * O WhatsApp é o único canal que alcança esta rede — ninguém tem e-mail
 * corporativo. Um número gravado errado não dá erro em lugar nenhum: o link
 * simplesmente abre uma conversa que não existe, ou pior, a conversa de um
 * estranho. Por isso a normalização é conferida caso a caso.
 */
describe("Normalização do número", () => {
  it("aceita o formato que as pessoas escrevem", () => {
    for (const escrito of [
      "(41) 99999-9999",
      "41 99999-9999",
      "41999999999",
      "+55 41 99999-9999",
      "55 (41) 99999 9999",
      "5541999999999",
    ]) {
      assert.equal(normalizarTelefone(escrito), "5541999999999", `falhou em "${escrito}"`);
    }
  });

  /**
   * O zero de operadora é hábito de quem discava interurbano. Mantido, ele
   * viraria DDD "04" e o link apontaria para lugar nenhum.
   */
  it("descarta o zero de operadora", () => {
    assert.equal(normalizarTelefone("041 99999-9999"), "5541999999999");
    assert.equal(normalizarTelefone("0041999999999"), "5541999999999");
  });

  it("número fixo, com 10 dígitos, também passa", () => {
    assert.equal(normalizarTelefone("(41) 3333-4444"), "554133334444");
  });

  it("vazio continua vazio, sem virar um '55' solto", () => {
    assert.equal(normalizarTelefone(""), "");
    assert.equal(normalizarTelefone("abc"), "");
  });

  it("já normalizado passa intacto", () => {
    assert.equal(normalizarTelefone("5541999999999"), "5541999999999");
  });
});

describe("Validação", () => {
  it("aceita celular e fixo com DDD", () => {
    assert.equal(motivoDeTelefoneInvalido("5541999999999"), null);
    assert.equal(motivoDeTelefoneInvalido("554133334444"), null);
  });

  it("recusa vazio", () => {
    assert.ok(motivoDeTelefoneInvalido(""));
  });

  it("recusa curto e longo demais", () => {
    assert.match(motivoDeTelefoneInvalido("55419999") ?? "", /curto/i);
    assert.match(motivoDeTelefoneInvalido("55419999999999") ?? "", /longo/i);
  });

  /**
   * DDD abaixo de 11 não existe, e é o erro que um dígito a menos produz:
   * "4199999999" digitado sem o 9 vira DDD 41 e número curto; mas
   * "1999999999" — que parece completo — traz DDD 19, válido. O teste guarda
   * a faixa, que é o que separa os dois casos.
   */
  it("recusa DDD que não existe", () => {
    assert.match(motivoDeTelefoneInvalido("5501999999999") ?? "", /DDD/);
    assert.match(motivoDeTelefoneInvalido("5510999999999") ?? "", /DDD/);
    assert.equal(motivoDeTelefoneInvalido("5511999999999"), null, "11 é São Paulo");
    assert.equal(motivoDeTelefoneInvalido("5599999999999"), null, "99 é o teto");
  });

  it("o que a normalização produz é aceito, ou é vazio", () => {
    for (const escrito of ["(41) 99999-9999", "041 3333-4444", "+55 11 98888 7777"]) {
      const normalizado = normalizarTelefone(escrito);
      assert.equal(
        motivoDeTelefoneInvalido(normalizado),
        null,
        `"${escrito}" normalizou para "${normalizado}" e a validação recusou`
      );
    }
  });
});

describe("Exibição", () => {
  it("celular sai legível", () => {
    assert.equal(formatarTelefone("5541999999999"), "(41) 99999-9999");
  });

  it("fixo sai legível", () => {
    assert.equal(formatarTelefone("554133334444"), "(41) 3333-4444");
  });

  it("sem número, um traço", () => {
    assert.equal(formatarTelefone(null), "—");
    assert.equal(formatarTelefone(""), "—");
  });
});

describe("O link", () => {
  it("aponta para o wa.me com o número e o texto", () => {
    const link = linkDeWhatsApp("5541999999999", "Oi, Maria!");
    assert.ok(link.startsWith("https://wa.me/5541999999999?text="));
    assert.match(link, /Oi%2C%20Maria!|Oi%2C\+Maria!/);
  });

  /**
   * Quebra de linha, acento e "&" passam por uma URL sem escape e cortam a
   * mensagem no meio — o destinatário receberia metade do recado.
   */
  it("escapa quebra de linha, acento e e-comercial", () => {
    const link = linkDeWhatsApp("5541999999999", "linha1\nlinha2 & ação");
    assert.doesNotMatch(link, /\n/);
    assert.doesNotMatch(link, /&\s|&a/, "o & do texto não pode virar separador de parâmetro");
    assert.match(link, /%0A/, "a quebra de linha vai codificada");
  });
});

describe("As mensagens", () => {
  it("a credencial leva usuário, senha e endereço", () => {
    const m = mensagemDeCredencial({
      nome: "Maiara Daniele Boeira Vaz",
      username: "maiara.vaz",
      senha: "Tri-K7M2XP4Q",
      endereco: "https://academia.exemplo",
    });

    assert.match(m, /Maiara/);
    assert.doesNotMatch(m, /Daniele/, "trata pelo primeiro nome");
    assert.match(m, /maiara\.vaz/);
    assert.match(m, /Tri-K7M2XP4Q/);
    assert.match(m, /https:\/\/academia\.exemplo/);
  });

  /**
   * A senha original não é recuperável depois do cadastro. Se o lembrete
   * fingisse entregá-la, alguém teria de inventar uma — e senha inventada num
   * aviso é pior do que aviso nenhum.
   */
  it("o lembrete NÃO leva senha", () => {
    const m = mensagemDeLembrete({
      nome: "Jonas Borges Vieira",
      username: "jonas.vieira",
      endereco: "https://academia.exemplo",
    });

    assert.match(m, /jonas\.vieira/);
    assert.doesNotMatch(m, /Senha:/);
  });

  it("o aviso de prazo diz a situação em português", () => {
    const base = { nome: "Ana", curso: "Brigada de Incêndio", endereco: "x" };

    assert.match(mensagemDePrazo({ ...base, diasRestantes: -3 }), /venceu há 3 dia/);
    assert.match(mensagemDePrazo({ ...base, diasRestantes: 0 }), /vence hoje/);
    assert.match(mensagemDePrazo({ ...base, diasRestantes: 5 }), /vence em 5 dia/);
    assert.match(mensagemDePrazo({ ...base, diasRestantes: null }), /está pendente/);
  });
});
