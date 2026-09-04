import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAXIMO,
  motivoDeNomeInvalido,
  normalizarNomeDeUsuario,
  sugerirNomeDeUsuario,
} from "../src/lib/nome-de-usuario";

/**
 * O nome de usuário é o identificador de ACESSO — não há e-mail nem matrícula
 * atrás dele. Um formato que aceite variação é um login que a pessoa não
 * consegue reproduzir: ela não sabe se digitou com acento, com espaço ou com
 * maiúscula no dia do cadastro.
 */
describe("Normalização do que foi digitado", () => {
  it("tira acento, caixa e espaço das pontas", () => {
    assert.equal(normalizarNomeDeUsuario("  José Antônio  "), "jose.antonio");
  });

  it("espaço no meio vira ponto", () => {
    assert.equal(normalizarNomeDeUsuario("Maria Silva"), "maria.silva");
  });

  it("descarta o que não pertence ao formato", () => {
    assert.equal(normalizarNomeDeUsuario("maria+silva@casa"), "mariasilvacasa");
  });

  it("junta separadores repetidos", () => {
    assert.equal(normalizarNomeDeUsuario("maria...silva"), "maria.silva");
  });

  it("não deixa separador nas pontas", () => {
    assert.equal(normalizarNomeDeUsuario(".maria.silva."), "maria.silva");
  });

  /**
   * A ç é o caso que o NFD não resolve: ela se decompõe em "c" + cedilha, e a
   * cedilha cai junto com os acentos. Se a decomposição fosse feita errado, o
   * resultado seria "gonalves" — um login quase certo, e por isso pior do que
   * um erro evidente.
   */
  it("cedilha vira c, não some", () => {
    assert.equal(normalizarNomeDeUsuario("Gonçalves"), "goncalves");
  });

  it("já normalizado passa intacto", () => {
    assert.equal(normalizarNomeDeUsuario("maria.silva"), "maria.silva");
  });
});

describe("Validação do que vai ser gravado", () => {
  it("aceita o formato esperado", () => {
    for (const bom of ["maria.silva", "jose_antonio", "ana-paula", "maria.silva.2", "abc"]) {
      assert.equal(motivoDeNomeInvalido(bom), null, `${bom} deveria passar`);
    }
  });

  it("recusa curto demais", () => {
    assert.match(motivoDeNomeInvalido("jo") ?? "", /ao menos 3/);
  });

  it("recusa longo demais", () => {
    assert.match(motivoDeNomeInvalido("a".repeat(MAXIMO + 1)) ?? "", /passa de/);
  });

  /**
   * Começar por letra deixa o campo distinguível de matrícula e de telefone, e
   * evita que um login vire número puro num sistema onde número puro não
   * significa nada.
   */
  it("recusa o que não começa por letra", () => {
    assert.match(motivoDeNomeInvalido("2maria") ?? "", /começar por letra/);
    assert.match(motivoDeNomeInvalido(".maria") ?? "", /começar por letra/);
  });

  it("recusa maiúscula, acento e espaço", () => {
    assert.ok(motivoDeNomeInvalido("Maria.silva"));
    assert.ok(motivoDeNomeInvalido("maria.sílva"));
    assert.ok(motivoDeNomeInvalido("maria silva"));
  });

  it("recusa separador no fim e separador dobrado", () => {
    assert.match(motivoDeNomeInvalido("maria.") ?? "", /terminar em/);
    assert.match(motivoDeNomeInvalido("maria..silva") ?? "", /dois separadores/);
  });

  /**
   * Uma arroba passando pela validação significaria contas cujo login parece
   * e-mail — exatamente a confusão que esta mudança existe para desfazer.
   */
  it("recusa qualquer coisa com arroba", () => {
    assert.ok(motivoDeNomeInvalido("maria@trihoteis.com.br"));
  });

  it("o que a normalização produz é sempre aceito, ou é vazio", () => {
    const entradas = ["José Antônio", "  Maria  Silva  ", "Ana-Paula", "...", "@@@", "Gonçalves"];
    for (const entrada of entradas) {
      const normalizado = normalizarNomeDeUsuario(entrada);
      if (normalizado.length >= 3) {
        assert.equal(
          motivoDeNomeInvalido(normalizado),
          null,
          `"${entrada}" normalizou para "${normalizado}", que a validação recusou`
        );
      }
    }
  });
});

describe("Sugestão a partir do nome completo", () => {
  it("usa primeiro e último nome", () => {
    assert.equal(sugerirNomeDeUsuario("Maria Aparecida Silva"), "maria.silva");
  });

  it("descarta conectivos", () => {
    assert.equal(sugerirNomeDeUsuario("Maria de Souza dos Santos"), "maria.santos");
  });

  it("nome único vira ele mesmo", () => {
    assert.equal(sugerirNomeDeUsuario("Madonna"), "madonna");
  });

  it("respeita o teto de caracteres", () => {
    const sugerido = sugerirNomeDeUsuario(`${"a".repeat(30)} ${"b".repeat(30)}`);
    assert.ok(sugerido.length <= MAXIMO, `sugeriu ${sugerido.length} caracteres`);
    assert.equal(motivoDeNomeInvalido(sugerido), null);
  });

  it("nome sem nada aproveitável devolve vazio", () => {
    assert.equal(sugerirNomeDeUsuario("!!!"), "");
  });

  /**
   * A sugestão é um ponto de partida, não uma decisão: duas pessoas homônimas
   * geram a MESMA sugestão de propósito. O desempate é de quem cadastra, que é
   * quem sabe que são duas pessoas — o código não tem como saber.
   */
  it("homônimos recebem a mesma sugestão, e isso é intencional", () => {
    assert.equal(sugerirNomeDeUsuario("Maria Silva"), sugerirNomeDeUsuario("Maria Silva"));
  });
});
