import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomCode } from "../src/lib/utils";

/**
 * O código do certificado passou a ser um segredo quando a conferência virou
 * pública: quem adivinha um código lê o nome de quem concluiu e o curso. Estes
 * testes guardam as duas propriedades que sustentam isso — imprevisibilidade e
 * ausência de colisão.
 */
describe("Código de certificado", () => {
  it("não repete em dez mil sorteios", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 10_000; i++) vistos.add(randomCode("CERT"));

    assert.equal(vistos.size, 10_000, "todo código sorteado é único");
  });

  it("mantém o prefixo e o ano", () => {
    const codigo = randomCode("TRI");
    assert.match(codigo, new RegExp(`^TRI-${new Date().getFullYear()}-`));
  });

  it("usa só caracteres que não se confundem ao digitar", () => {
    for (let i = 0; i < 200; i++) {
      const parte = randomCode("CERT").split("-")[2];
      assert.match(parte, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    }
  });

  /**
   * O defeito que este teste pega é o que existia antes: um código derivado do
   * relógio muda pouco entre duas emissões próximas, e o resto era Math.random.
   * Emissões consecutivas não podem compartilhar um prefixo longo.
   */
  it("dois códigos seguidos não compartilham começo", () => {
    const a = randomCode("CERT").split("-")[2];
    const b = randomCode("CERT").split("-")[2];

    let iguais = 0;
    while (iguais < a.length && a[iguais] === b[iguais]) iguais++;

    assert.ok(iguais < 4, `prefixo comum longo demais: ${iguais} caracteres`);
  });

  it("cada posição varia — nenhuma fica presa num valor", () => {
    const porPosicao = Array.from({ length: 10 }, () => new Set<string>());
    for (let i = 0; i < 300; i++) {
      const parte = randomCode("CERT").split("-")[2];
      for (let p = 0; p < 10; p++) porPosicao[p].add(parte[p]);
    }

    for (const [posicao, valores] of porPosicao.entries()) {
      assert.ok(valores.size > 10, `posição ${posicao} variou pouco: ${valores.size}`);
    }
  });
});
