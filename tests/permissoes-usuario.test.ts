import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  departamentosPermitidos,
  motivoDeBloqueio,
  motivoDeBloqueioDeCurso,
  motivoDeVinculoDeCursoInvalido,
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
  return { id: "ator", protegido: false, departamentos: [RECEPCAO], ...over };
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
    const outroDono = ator({ id: "outro", protegido: true, departamentos: [] });
    const motivo = motivoDeBloqueio(alvo({ protegido: true }), outroDono);
    assert.match(motivo ?? "", /conta protegida/);
  });

  it("o proprietário alcança qualquer departamento", () => {
    const dono = ator({ protegido: true, departamentos: [] });
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
    const motivo = motivoDeBloqueio(alvo(), ator({ departamentos: [] }));
    assert.match(motivo ?? "", /não tem departamento definido/);
  });

  it("qualquer conta continua alterando a si mesma", () => {
    const solto = ator({ id: "eu", departamentos: [] });
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
    assert.match(motivo ?? "", /seus próprios departamentos/);
  });

  it("administrador vincula ao próprio departamento", () => {
    assert.equal(motivoDeVinculoInvalido(ator(), RECEPCAO), null);
  });

  it("administrador não deixa um usuário sem departamento", () => {
    assert.notEqual(motivoDeVinculoInvalido(ator(), null), null);
  });

  it("o proprietário vincula a qualquer departamento, inclusive nenhum", () => {
    const dono = ator({ protegido: true, departamentos: [] });
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
    assert.equal(departamentosPermitidos(ator({ departamentos: [] }), todos).length, 0);
  });
});

describe("Alcance de conteúdo (cursos, módulos, aulas)", () => {
  const curso = (departmentId: string | null) => ({ title: "NR-35", departmentId });

  it("altera curso do próprio departamento", () => {
    assert.equal(motivoDeBloqueioDeCurso(curso(RECEPCAO), ator()), null);
  });

  it("não altera curso de outro departamento", () => {
    const motivo = motivoDeBloqueioDeCurso(curso(FINANCEIRO), ator());
    assert.match(motivo ?? "", /outro departamento/);
  });

  /**
   * Curso sem departamento fica reservado ao proprietário. É o estado dos
   * cursos criados antes desta regra: deixá-los abertos a qualquer
   * administrador seria o contrário do que a regra existe para fazer.
   */
  it("curso sem departamento é só do proprietário", () => {
    assert.notEqual(motivoDeBloqueioDeCurso(curso(null), ator()), null);
    assert.equal(motivoDeBloqueioDeCurso(curso(null), ator({ protegido: true })), null);
  });

  it("o proprietário alcança curso de qualquer departamento", () => {
    const dono = ator({ protegido: true, departamentos: [] });
    assert.equal(motivoDeBloqueioDeCurso(curso(FINANCEIRO), dono), null);
  });

  it("administrador sem departamento não alcança curso nenhum", () => {
    const motivo = motivoDeBloqueioDeCurso(curso(RECEPCAO), ator({ departamentos: [] }));
    assert.match(motivo ?? "", /não tem departamento definido/);
  });

  it("não empurra um curso para outro departamento", () => {
    const motivo = motivoDeVinculoDeCursoInvalido(ator(), FINANCEIRO);
    assert.match(motivo ?? "", /seus próprios departamentos/);
  });

  it("não larga um curso sem departamento", () => {
    assert.notEqual(motivoDeVinculoDeCursoInvalido(ator(), null), null);
  });

  it("o proprietário move um curso para onde quiser", () => {
    const dono = ator({ protegido: true, departamentos: [] });
    assert.equal(motivoDeVinculoDeCursoInvalido(dono, FINANCEIRO), null);
    assert.equal(motivoDeVinculoDeCursoInvalido(dono, null), null);
  });
});

describe("Departamentos adicionais", () => {
  const EVENTOS = "dep-eventos";

  it("alcança usuários de qualquer um dos seus departamentos", () => {
    const gestorDeDois = ator({ departamentos: [RECEPCAO, FINANCEIRO] });

    assert.equal(motivoDeBloqueio(alvo({ departmentId: RECEPCAO }), gestorDeDois), null);
    assert.equal(motivoDeBloqueio(alvo({ departmentId: FINANCEIRO }), gestorDeDois), null);
  });

  it("continua barrando departamento fora da lista", () => {
    const gestorDeDois = ator({ departamentos: [RECEPCAO, FINANCEIRO] });
    const motivo = motivoDeBloqueio(alvo({ departmentId: EVENTOS }), gestorDeDois);

    assert.notEqual(motivo, null);
    assert.match(String(motivo), /outro departamento/);
  });

  it("vincula usuário a qualquer um dos seus, e só a esses", () => {
    const gestorDeDois = ator({ departamentos: [RECEPCAO, FINANCEIRO] });

    assert.equal(motivoDeVinculoInvalido(gestorDeDois, FINANCEIRO), null);
    assert.notEqual(motivoDeVinculoInvalido(gestorDeDois, EVENTOS), null);
  });

  it("oferece no formulário exatamente os departamentos que alcança", () => {
    const gestorDeDois = ator({ departamentos: [RECEPCAO, EVENTOS] });
    const todos = [{ id: RECEPCAO }, { id: FINANCEIRO }, { id: EVENTOS }];

    const permitidos = departamentosPermitidos(gestorDeDois, todos).map((d) => d.id);

    assert.deepEqual(permitidos, [RECEPCAO, EVENTOS]);
  });

  it("conteúdo segue a mesma lista", () => {
    const gestorDeDois = ator({ departamentos: [RECEPCAO, FINANCEIRO] });

    assert.equal(
      motivoDeBloqueioDeCurso({ title: "X", departmentId: FINANCEIRO }, gestorDeDois),
      null
    );
    assert.notEqual(
      motivoDeBloqueioDeCurso({ title: "X", departmentId: EVENTOS }, gestorDeDois),
      null
    );
    assert.equal(motivoDeVinculoDeCursoInvalido(gestorDeDois, RECEPCAO), null);
  });

  it("lista vazia é o mesmo que não ter departamento", () => {
    const semNada = ator({ departamentos: [] });

    assert.match(String(motivoDeBloqueio(alvo(), semNada)), /não tem departamento definido/);
  });
});
