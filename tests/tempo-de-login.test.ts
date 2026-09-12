import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compararComHashIsca, hashPassword, verifyPassword } from "../src/lib/password";

/**
 * O login não pode revelar, pelo tempo de resposta, quais contas existem.
 *
 * O buraco era concreto: o bcrypt só rodava quando a conta existia, então "não
 * existe" respondia dezenas de ms mais cedo que "existe, senha errada". Medido
 * contra o servidor no ar, ~22 ms contra ~95 ms — suficiente para enumerar os
 * nomes de usuário sem acertar senha alguma.
 *
 * A correção é o caminho "não existe" comparar a senha contra um hash-isca, para
 * gastar o mesmo trabalho. O que se garante aqui é que esse trabalho EXISTE e é
 * da mesma ordem do de uma verificação real — não o número de ms, que varia por
 * máquina.
 */

/** Mediana de `vezes` execuções de `fn`, em milissegundos. */
async function medianaMs(fn: () => Promise<unknown>, vezes: number): Promise<number> {
  const amostras: number[] = [];
  for (let i = 0; i < vezes; i += 1) {
    const t = performance.now();
    await fn();
    amostras.push(performance.now() - t);
  }
  amostras.sort((a, b) => a - b);
  return amostras[Math.floor(amostras.length / 2)];
}

describe("Tempo de senha no ramo sem conta", () => {
  it("gasta trabalho de bcrypt, como uma verificação real", async () => {
    const hashReal = await hashPassword("SenhaDeVerdade@2026");

    // Aquecimento: a primeira chamada do isca calcula e guarda o hash.
    await compararComHashIsca("qualquer");
    await verifyPassword("errada", hashReal);

    const real = await medianaMs(() => verifyPassword("errada", hashReal), 5);
    const isca = await medianaMs(() => compararComHashIsca("errada"), 5);

    /*
      bcrypt de custo 10 não é instantâneo. Um piso baixo (2 ms) não flaca numa
      máquina lenta e ainda assim pega alguém que troque o isca por um no-op, que
      cairia para frações de milissegundo.
    */
    assert.ok(isca > 2, `o ramo sem conta gastou só ${isca.toFixed(2)} ms — bcrypt não rodou?`);

    /*
      E os dois caminhos têm de custar o mesmo, senão a diferença volta a
      enumerar. Faixa larga para não flacar com o ruído da máquina; um caminho
      sem bcrypt estouraria qualquer faixa.
    */
    const razao = isca / real;
    assert.ok(
      razao > 0.3 && razao < 3,
      `tempos díspares: isca ${isca.toFixed(2)} ms vs real ${real.toFixed(2)} ms (razão ${razao.toFixed(2)})`
    );
  });
});
