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
  return { id: "ator", protegido: false, departamentos: [RECEPCAO], unidades: [], ...over };
}

function alvo(over: Partial<Alvo> = {}): Alvo {
  return {
    id: "alvo",
    name: "Fulano",
    protegido: false,
    departmentId: RECEPCAO,
    unidadeId: null,
    ...over,
  };
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

  /**
   * "Sem alcance" passou a significar sem departamento E sem unidade, desde
   * que o hotel virou uma segunda dimensão. A recusa é a mesma; só o texto
   * mudou, para o gerente de hotel não pedir a coisa errada ao proprietário.
   */
  it("administrador sem departamento nem unidade não alcança ninguém", () => {
    const motivo = motivoDeBloqueio(alvo(), ator({ departamentos: [], unidades: [] }));
    assert.match(motivo ?? "", /não tem departamento nem unidade/);
  });

  it("qualquer conta continua alterando a si mesma", () => {
    const solto = ator({ id: "eu", departamentos: [] });
    assert.equal(motivoDeBloqueio(alvo({ id: "eu", departmentId: null }), solto), null);
  });
});

/**
 * Alcance por UNIDADE — o hotel.
 *
 * A rede tem 25 hotéis e cada um se administra: o gerente do Paranaguá cuida
 * da própria equipe, e não da equipe dos outros. Como é uma dimensão nova
 * sobre a mesma trava, cada combinação é conferida aqui — permissão errada não
 * aparece na tela, aparece quando alguém já alterou o que não devia.
 */
describe("Alcance por unidade", () => {
  const PARANAGUA = "hotel-paranagua";
  const CURITIBA = "hotel-curitiba";

  /** O gerente de hotel: unidade definida, sem departamento. */
  const gerente = (unidades: string[]) => ator({ departamentos: [], unidades });

  it("o gerente alcança quem é do hotel dele", () => {
    const motivo = motivoDeBloqueio(
      alvo({ departmentId: FINANCEIRO, unidadeId: PARANAGUA }),
      gerente([PARANAGUA])
    );
    assert.equal(motivo, null, "dentro do hotel, o departamento não restringe");
  });

  it("o gerente NÃO alcança quem é de outro hotel", () => {
    const motivo = motivoDeBloqueio(
      alvo({ departmentId: RECEPCAO, unidadeId: CURITIBA }),
      gerente([PARANAGUA])
    );
    assert.match(motivo ?? "", /outra unidade/);
  });

  it("quem não tem unidade nenhuma fica fora do alcance do gerente", () => {
    const motivo = motivoDeBloqueio(
      alvo({ unidadeId: null }),
      gerente([PARANAGUA])
    );
    assert.match(motivo ?? "", /outra unidade/);
  });

  it("gerente de dois hotéis alcança os dois", () => {
    const dois = gerente([PARANAGUA, CURITIBA]);
    assert.equal(motivoDeBloqueio(alvo({ unidadeId: PARANAGUA }), dois), null);
    assert.equal(motivoDeBloqueio(alvo({ unidadeId: CURITIBA }), dois), null);
  });

  /**
   * A decisão central: as duas dimensões se somam por INTERSEÇÃO.
   *
   * Acrescentar uma restrição precisa ESTREITAR o alcance, nunca alargá-lo. Se
   * fosse união, dar um hotel a quem já tem um departamento passaria a
   * conceder o setor inteiro da rede MAIS o hotel inteiro — alargando o poder
   * de alguém sem que ninguém percebesse.
   */
  it("com departamento E unidade, alcança só a interseção", () => {
    const recepcaoDoParanagua = ator({
      departamentos: [RECEPCAO],
      unidades: [PARANAGUA],
    });

    assert.equal(
      motivoDeBloqueio(alvo({ departmentId: RECEPCAO, unidadeId: PARANAGUA }), recepcaoDoParanagua),
      null,
      "recepção do Paranaguá: alcança"
    );
    assert.match(
      motivoDeBloqueio(alvo({ departmentId: RECEPCAO, unidadeId: CURITIBA }), recepcaoDoParanagua) ?? "",
      /outra unidade/,
      "recepção de outro hotel: não alcança"
    );
    assert.match(
      motivoDeBloqueio(alvo({ departmentId: FINANCEIRO, unidadeId: PARANAGUA }), recepcaoDoParanagua) ?? "",
      /outro departamento/,
      "outro setor do mesmo hotel: não alcança"
    );
  });

  it("quem só tem departamento continua alcançando a rede toda naquele setor", () => {
    const rhCorporativo = ator({ departamentos: [RECEPCAO], unidades: [] });

    assert.equal(
      motivoDeBloqueio(alvo({ departmentId: RECEPCAO, unidadeId: PARANAGUA }), rhCorporativo),
      null
    );
    assert.equal(
      motivoDeBloqueio(alvo({ departmentId: RECEPCAO, unidadeId: CURITIBA }), rhCorporativo),
      null,
      "sem unidade definida, o hotel não restringe"
    );
  });

  /**
   * O padrão seguro que já existia: conta administrativa recém-criada enxerga
   * a plataforma e não altera ninguém. Com duas dimensões, "vazio" passou a
   * significar as duas vazias.
   */
  it("sem departamento e sem unidade, não alcança ninguém", () => {
    const motivo = motivoDeBloqueio(
      alvo({ unidadeId: PARANAGUA }),
      ator({ departamentos: [], unidades: [] })
    );
    assert.match(motivo ?? "", /não tem departamento nem unidade/);
  });

  it("o proprietário continua alcançando tudo", () => {
    const motivo = motivoDeBloqueio(
      alvo({ departmentId: FINANCEIRO, unidadeId: CURITIBA }),
      ator({ protegido: true, departamentos: [], unidades: [] })
    );
    assert.equal(motivo, null);
  });

  it("conta protegida continua intocável, mesmo dentro do hotel", () => {
    const motivo = motivoDeBloqueio(
      alvo({ protegido: true, unidadeId: PARANAGUA }),
      gerente([PARANAGUA])
    );
    assert.match(motivo ?? "", /conta protegida/);
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
    const semNada = ator({ departamentos: [], unidades: [] });

    assert.match(String(motivoDeBloqueio(alvo(), semNada)), /não tem departamento nem unidade/);
  });
});
