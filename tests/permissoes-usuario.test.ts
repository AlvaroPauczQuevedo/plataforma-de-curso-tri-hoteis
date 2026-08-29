import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  departamentosPermitidos,
  motivoDeBloqueio,
  motivoDeVinculoInvalido,
  type Alvo,
  type Ator,
} from "../src/lib/permissoes-usuario";

/**
 * Regras de quem altera quem.
 *
 * Estes testes chamam as mesmas funções que as server actions e as telas do
 * painel chamam — não uma réplica da regra. Se a decisão mudar, muda aqui.
 */

const RECEPCAO = "dep-recepcao";
const FINANCEIRO = "dep-financeiro";

function ator(over: Partial<Ator> = {}): Ator {
  return { id: "ator", protegido: false, departmentId: RECEPCAO, ...over };
}

function alvo(over: Partial<Alvo> = {}): Alvo {
  return { id: "alvo", name: "Fulano", protegido: false, departmentId: RECEPCAO, ...over };
}

describe("Conta protegida", () => {
  it("administrador comum não altera uma conta protegida", () => {
    const motivo = motivoDeBloqueio(alvo({ protegido: true }), ator());
    assert.match(motivo ?? "", /conta protegida/);
  });

  it("o titular altera a própria conta", () => {
    const dono = ator({ id: "dono", protegido: true });
    assert.equal(motivoDeBloqueio(alvo({ id: "dono", protegido: true }), dono), null);
  });

  it("a proteção vence até para outro proprietário", () => {
    const outroDono = ator({ id: "outro", protegido: true, departmentId: null });
    const motivo = motivoDeBloqueio(alvo({ protegido: true }), outroDono);
    assert.match(motivo ?? "", /conta protegida/);
  });

  it("o proprietário alcança qualquer departamento", () => {
    const dono = ator({ protegido: true, departmentId: null });
    assert.equal(motivoDeBloqueio(alvo({ departmentId: FINANCEIRO }), dono), null);
  });
});

describe("Alcance por departamento", () => {
  it("altera quem é do mesmo departamento", () => {
    assert.equal(motivoDeBloqueio(alvo(), ator()), null);
  });

  it("não altera quem é de outro departamento", () => {
    const motivo = motivoDeBloqueio(alvo({ departmentId: FINANCEIRO }), ator());
    assert.match(motivo ?? "", /outro departamento/);
  });

  it("não altera quem está sem departamento", () => {
    assert.notEqual(motivoDeBloqueio(alvo({ departmentId: null }), ator()), null);
  });

  it("administrador sem departamento não alcança ninguém", () => {
    const motivo = motivoDeBloqueio(alvo(), ator({ departmentId: null }));
    assert.match(motivo ?? "", /não tem departamento definido/);
  });

  it("qualquer conta continua alterando a si mesma", () => {
    const solto = ator({ id: "eu", departmentId: null });
    assert.equal(motivoDeBloqueio(alvo({ id: "eu", departmentId: null }), solto), null);
  });
});

describe("Vínculo de departamento", () => {
  /**
   * O ponto desta regra: como toda conta edita a si mesma, sem ela bastaria
   * trocar o próprio departamento para alcançar a plataforma inteira.
   */
  it("administrador não se muda para outro departamento", () => {
    const motivo = motivoDeVinculoInvalido(ator(), FINANCEIRO);
    assert.match(motivo ?? "", /seu próprio departamento/);
  });

  it("administrador vincula ao próprio departamento", () => {
    assert.equal(motivoDeVinculoInvalido(ator(), RECEPCAO), null);
  });

  it("administrador não deixa um usuário sem departamento", () => {
    assert.notEqual(motivoDeVinculoInvalido(ator(), null), null);
  });

  it("o proprietário vincula a qualquer departamento, inclusive nenhum", () => {
    const dono = ator({ protegido: true, departmentId: null });
    assert.equal(motivoDeVinculoInvalido(dono, FINANCEIRO), null);
    assert.equal(motivoDeVinculoInvalido(dono, null), null);
  });
});

describe("Departamentos oferecidos no formulário", () => {
  const todos = [{ id: RECEPCAO }, { id: FINANCEIRO }, { id: "dep-ti" }];

  it("o proprietário vê todos", () => {
    assert.equal(departamentosPermitidos(ator({ protegido: true }), todos).length, 3);
  });

  it("administrador comum vê apenas o seu", () => {
    const lista = departamentosPermitidos(ator(), todos);
    assert.deepEqual(lista, [{ id: RECEPCAO }]);
  });

  it("administrador sem departamento não vê nenhum", () => {
    assert.equal(departamentosPermitidos(ator({ departmentId: null }), todos).length, 0);
  });
});
