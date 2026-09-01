import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapaDeLiberacao } from "../src/lib/liberacao-de-aulas";

const aula = (id: string, required = true) => ({ id, required });

describe("Liberação de aulas", () => {
  it("curso sem ordem obrigatória libera tudo", () => {
    const mapa = mapaDeLiberacao(
      [aula("a"), aula("b"), aula("c")],
      new Set(),
      false
    );
    assert.deepEqual([...mapa.values()], [true, true, true]);
  });

  it("a primeira aula sempre abre", () => {
    const mapa = mapaDeLiberacao([aula("a"), aula("b")], new Set(), true);
    assert.equal(mapa.get("a"), true);
    assert.equal(mapa.get("b"), false);
  });

  it("libera uma de cada vez, não em cascata", () => {
    const mapa = mapaDeLiberacao(
      [aula("a"), aula("b"), aula("c")],
      new Set(["a"]),
      true
    );
    assert.equal(mapa.get("b"), true);
    assert.equal(mapa.get("c"), false, "concluir a primeira não abre a terceira");
  });

  it("aula opcional pulada não tranca as seguintes", () => {
    const mapa = mapaDeLiberacao(
      [aula("a"), aula("opcional", false), aula("c")],
      new Set(["a"]),
      true
    );
    assert.equal(mapa.get("c"), true, "opcional que trava não seria opcional");
  });

  it("obrigatória pendente tranca tudo o que vem depois", () => {
    const mapa = mapaDeLiberacao(
      [aula("a"), aula("b"), aula("c"), aula("d")],
      new Set(["a", "c"]),
      true
    );
    assert.equal(mapa.get("b"), true, "b é a próxima da fila");
    assert.equal(mapa.get("c"), false, "b continua pendente");
    assert.equal(
      mapa.get("d"),
      false,
      "concluir c fora de ordem não adianta enquanto b estiver aberta"
    );
  });

  it("com tudo concluído, tudo fica aberto", () => {
    const mapa = mapaDeLiberacao(
      [aula("a"), aula("b"), aula("c")],
      new Set(["a", "b", "c"]),
      true
    );
    assert.deepEqual([...mapa.values()], [true, true, true]);
  });

  it("curso vazio não quebra", () => {
    assert.equal(mapaDeLiberacao([], new Set(), true).size, 0);
  });
});
