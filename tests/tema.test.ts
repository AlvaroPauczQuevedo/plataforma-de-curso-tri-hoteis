import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAVE_DO_TEMA,
  lerEscolha,
  proximaEscolha,
  resolverTema,
  scriptDeTema,
} from "../src/lib/tema";

/**
 * A regra do tema claro e escuro.
 *
 * O botão da barra superior e o script que roda antes da pintura chamam estas
 * mesmas funções. O que se testa aqui é o que decide, no navegador de quem usa,
 * qual tema aparece.
 */

describe("A escolha de tema", () => {
  it("volta para 'sistema' diante de qualquer coisa inesperada", () => {
    // Chave ausente, valor de uma versão anterior, ou alguém que editou o
    // armazenamento à mão. O padrão seguro é acompanhar o aparelho.
    assert.equal(lerEscolha(null), "sistema");
    assert.equal(lerEscolha(""), "sistema");
    assert.equal(lerEscolha("dark"), "sistema");
    assert.equal(lerEscolha("{}"), "sistema");
  });

  it("preserva uma escolha válida", () => {
    assert.equal(lerEscolha("claro"), "claro");
    assert.equal(lerEscolha("escuro"), "escuro");
    assert.equal(lerEscolha("sistema"), "sistema");
  });
});

describe("A resolução do tema", () => {
  it("respeita a escolha explícita, contra a preferência do aparelho", () => {
    // Quem escolheu claro continua no claro mesmo que o celular vire para o
    // escuro ao anoitecer. Escolha explícita vence o sistema.
    assert.equal(resolverTema("claro", true), "light");
    assert.equal(resolverTema("escuro", false), "dark");
  });

  it("segue o aparelho quando a escolha é 'sistema'", () => {
    assert.equal(resolverTema("sistema", true), "dark");
    assert.equal(resolverTema("sistema", false), "light");
  });
});

describe("O clique no botão", () => {
  it("adota o oposto do que está na tela", () => {
    /*
      A partir de "sistema" este é o único resultado que corresponde ao que a
      pessoa quis dizer. Gravar "escuro" às cegas daria certo por acaso quando
      o sistema estivesse no claro, e deixaria o clique SEM EFEITO quando o
      sistema já estivesse no escuro.
    */
    assert.equal(proximaEscolha("light"), "escuro");
    assert.equal(proximaEscolha("dark"), "claro");
  });

  it("sempre produz um tema diferente do atual", () => {
    for (const atual of ["light", "dark"] as const) {
      const escolhido = proximaEscolha(atual);
      // O segundo argumento não importa: a escolha passa a ser explícita.
      assert.notEqual(resolverTema(escolhido, true), atual);
      assert.notEqual(resolverTema(escolhido, false), atual);
    }
  });
});

describe("O script que roda antes da pintura", () => {
  it("usa a mesma chave de armazenamento do resto do código", () => {
    // Duas cópias da chave divergiriam e a escolha salva pararia de ser lida,
    // sem erro nenhum aparecendo.
    assert.ok(scriptDeTema().includes(JSON.stringify(CHAVE_DO_TEMA)));
  });

  it("decide o mesmo que resolverTema, para os quatro casos", () => {
    /*
      O script é JavaScript escrito à mão em texto, fora do alcance do
      compilador. Este teste o EXECUTA com um localStorage e um matchMedia de
      mentira e confere contra a função tipada — que é o que impede os dois de
      divergirem sem ninguém perceber.
    */
    const casos: [string | null, boolean, string][] = [
      ["escuro", false, "dark"],
      ["claro", true, "light"],
      ["sistema", true, "dark"],
      ["sistema", false, "light"],
      [null, true, "dark"],
      [null, false, "light"],
    ];

    for (const [guardado, sistemaEscuro, esperado] of casos) {
      let aplicado: string | null = null;
      const documentoFalso = {
        documentElement: {
          setAttribute: (nome: string, valor: string) => {
            if (nome === "data-theme") aplicado = valor;
          },
        },
      };
      const janelaFalsa = {
        matchMedia: () => ({ matches: sistemaEscuro }),
        localStorage: { getItem: () => guardado },
      };

      new Function("document", "window", "localStorage", scriptDeTema())(
        documentoFalso,
        janelaFalsa,
        janelaFalsa.localStorage
      );

      assert.equal(
        aplicado,
        esperado,
        `guardado=${guardado} sistemaEscuro=${sistemaEscuro}`
      );
      assert.equal(
        aplicado,
        resolverTema(lerEscolha(guardado), sistemaEscuro),
        "o script divergiu de resolverTema"
      );
    }
  });

  it("cai no tema claro quando o armazenamento está bloqueado", () => {
    // Janela anônima, ou política corporativa: `localStorage` lança ao ser
    // lido. Falhar aqui não pode deixar a página sem tema nenhum.
    let aplicado: string | null = null;
    const documentoFalso = {
      documentElement: {
        setAttribute: (nome: string, valor: string) => {
          if (nome === "data-theme") aplicado = valor;
        },
      },
    };
    const janelaFalsa = {
      matchMedia: () => ({ matches: true }),
      localStorage: {
        getItem: () => {
          throw new Error("acesso negado");
        },
      },
    };

    new Function("document", "window", "localStorage", scriptDeTema())(
      documentoFalso,
      janelaFalsa,
      janelaFalsa.localStorage
    );

    assert.equal(aplicado, "light");
  });
});
