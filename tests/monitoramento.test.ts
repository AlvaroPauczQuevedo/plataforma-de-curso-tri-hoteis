import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

// ANTES do import abaixo, e não por estilo: este módulo desvia o registro de
// erros para pasta temporária, e o desvio só vale se acontecer antes de
// `monitoramento` carregar. A explicação inteira está lá dentro.
import { limparPastaDeErros } from "./erros-temporarios";

import {
  assinaturasConhecidas,
  limparHistoricoDeAvisos,
  registrarErro,
} from "../src/lib/monitoramento";

after(limparPastaDeErros);

const env = process.env as Record<string, string | undefined>;

/**
 * O agrupamento é a parte fácil de errar: sem ele, uma página quebrada gera um
 * aviso por acesso e o alerta vira ruído que se aprende a ignorar.
 *
 * Os testes silenciam o console porque `registrarErro` sempre registra no log —
 * e a saída do teste ficaria ilegível.
 */
beforeEach(() => {
  limparHistoricoDeAvisos();
  delete env.ALERTA_EMAIL;
  delete env.ALERTA_WEBHOOK_URL;
  mock.method(console, "error", () => {});
});

function erroCom(mensagem: string, pilha: string): Error {
  const e = new Error(mensagem);
  e.stack = `Error: ${mensagem}\n    at ${pilha}\n    at outra (linha:2:3)`;
  return e;
}

describe("Agrupamento de avisos", () => {
  it("o mesmo erro repetido conta como uma assinatura só", async () => {
    for (let i = 0; i < 5; i++) {
      await registrarErro(erroCom("coluna X não existe", "consulta (a.js:1:1)"), "/admin/cursos");
    }
    assert.equal(assinaturasConhecidas(), 1);
  });

  it("erros diferentes geram assinaturas diferentes", async () => {
    await registrarErro(erroCom("coluna X não existe", "consulta (a.js:1:1)"), "/admin/cursos");
    await registrarErro(erroCom("timeout no banco", "consulta (b.js:9:9)"), "/admin/cursos");

    assert.equal(assinaturasConhecidas(), 2);
  });

  /**
   * O mesmo defeito em telas diferentes é informação útil: mostra o alcance do
   * problema, não só que ele existe.
   */
  it("o mesmo erro em telas diferentes é avisado separadamente", async () => {
    const erro = () => erroCom("coluna X não existe", "consulta (a.js:1:1)");
    await registrarErro(erro(), "/admin/cursos");
    await registrarErro(erro(), "/admin/relatorios");

    assert.equal(assinaturasConhecidas(), 2);
  });

  it("passado o intervalo, o mesmo erro volta a avisar", async () => {
    env.ALERTA_INTERVALO_MIN = "0";
    const chamadas: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (...args: unknown[]) => {
      chamadas.push(args);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    env.ALERTA_WEBHOOK_URL = "https://exemplo.test/hook";

    try {
      const erro = () => erroCom("mesma falha", "consulta (a.js:1:1)");
      await registrarErro(erro(), "/admin");
      await registrarErro(erro(), "/admin");
      assert.equal(chamadas.length, 2, "sem silêncio, avisa as duas vezes");
    } finally {
      globalThis.fetch = original;
      delete env.ALERTA_INTERVALO_MIN;
    }
  });
});

describe("Sem destino configurado", () => {
  it("não tenta enviar nada, e não lança", async () => {
    const original = globalThis.fetch;
    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return new Response(null);
    }) as typeof fetch;

    try {
      await registrarErro(new Error("qualquer"), "/admin");
      assert.equal(chamou, false, "sem webhook configurado, nada é chamado");
    } finally {
      globalThis.fetch = original;
    }
  });

  /**
   * Um monitoramento que derruba a requisição por não conseguir avisar sobre a
   * falha é pior do que monitoramento nenhum.
   */
  it("o webhook falhando não derruba quem chamou", async () => {
    env.ALERTA_WEBHOOK_URL = "https://exemplo.test/hook";
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("rede fora");
    }) as typeof fetch;

    try {
      await registrarErro(new Error("qualquer"), "/admin");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("aceita valores que não são Error", async () => {
    await registrarErro("uma string solta", "/admin");
    await registrarErro(null, "/admin");
    assert.equal(assinaturasConhecidas(), 2);
  });
});
