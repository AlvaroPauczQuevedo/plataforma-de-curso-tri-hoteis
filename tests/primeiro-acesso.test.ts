import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { criarAdministrador, criarCurso, criarFuncionario, db, encerrar, matricular } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import {
  diasEntre,
  levantarPrimeiroAcesso,
  resumirAcessos,
  situacaoDeAcesso,
} from "../src/lib/primeiro-acesso";

after(encerrar);

const DIA = 24 * 60 * 60 * 1000;

/**
 * "A credencial que eu entreguei virou acesso?"
 *
 * A pergunta existe porque nesta rede ninguém tem e-mail: não há lembrete
 * automático possível, e a cobrança depende de alguém ter a lista na mão. Uma
 * lista errada é pior do que lista nenhuma — cobrar quem já entrou queima a
 * cobrança de quem não entrou.
 */
describe("Classificação de uma pessoa", () => {
  it("sem curso nenhum, não há o que começar", () => {
    assert.equal(
      situacaoDeAcesso({ matriculas: 0, lastLoginAt: new Date(), aulasConcluidas: 0 }),
      "sem_curso"
    );
  });

  /**
   * Esta ordem é a decisão central do módulo. As duas situações pedem ações de
   * donos diferentes: sem curso, quem falhou foi o administrador que esqueceu
   * de matricular; sem login, quem falta é a pessoa. Cobrar alguém por não ter
   * feito um treinamento que ninguém atribuiu a ela desmoraliza a cobrança
   * inteira — e é o erro fácil de cometer aqui.
   */
  it("sem curso vence 'nunca entrou': o problema é do administrador, não da pessoa", () => {
    assert.equal(
      situacaoDeAcesso({ matriculas: 0, lastLoginAt: null, aulasConcluidas: 0 }),
      "sem_curso"
    );
  });

  it("com curso e sem login, nunca entrou", () => {
    assert.equal(
      situacaoDeAcesso({ matriculas: 2, lastLoginAt: null, aulasConcluidas: 0 }),
      "nunca_entrou"
    );
  });

  it("entrou e não concluiu nada", () => {
    assert.equal(
      situacaoDeAcesso({ matriculas: 1, lastLoginAt: new Date(), aulasConcluidas: 0 }),
      "entrou_sem_comecar"
    );
  });

  it("uma aula concluída já é atividade", () => {
    assert.equal(
      situacaoDeAcesso({ matriculas: 1, lastLoginAt: new Date(), aulasConcluidas: 1 }),
      "ativo"
    );
  });
});

describe("Contagem de dias", () => {
  it("conta dias inteiros", () => {
    const inicio = new Date("2026-09-01T10:00:00Z");
    assert.equal(diasEntre(inicio, new Date("2026-09-04T10:00:00Z")), 3);
  });

  it("menos de um dia é zero, não meio dia", () => {
    const inicio = new Date("2026-09-04T10:00:00Z");
    assert.equal(diasEntre(inicio, new Date("2026-09-04T23:00:00Z")), 0);
  });

  /**
   * Relógio do servidor atrasado, ou registro gravado um instante à frente,
   * não podem virar "cadastrado há -1 dias" na tela.
   */
  it("data no futuro não gera número negativo", () => {
    const agora = new Date("2026-09-04T10:00:00Z");
    assert.equal(diasEntre(new Date("2026-09-05T10:00:00Z"), agora), 0);
  });
});

describe("Levantamento sobre o banco", () => {
  it("funcionário recém-criado, sem curso e sem login", async () => {
    const pessoa = await criarFuncionario();
    const { linhas } = await levantarPrimeiroAcesso({});
    const dele = linhas.find((l) => l.userId === pessoa.id);

    assert.ok(dele, "a pessoa precisa aparecer");
    assert.equal(dele!.situacao, "sem_curso");
    assert.equal(dele!.diasDesdeUltimoAcesso, null);
  });

  it("com curso atribuído e sem login, vira cobrança", async () => {
    const pessoa = await criarFuncionario();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await matricular(pessoa.id, curso.id);

    const { linhas } = await levantarPrimeiroAcesso({});
    const dele = linhas.find((l) => l.userId === pessoa.id);

    assert.equal(dele!.situacao, "nunca_entrou");
    assert.equal(dele!.matriculas, 1);
  });

  /**
   * Administrador não é público de treinamento. Se entrasse na lista, toda
   * conta administrativa apareceria como pendência permanente e o número no
   * cartão deixaria de significar alguma coisa.
   */
  it("administrador fica de fora", async () => {
    const admin = await criarAdministrador();
    const { linhas } = await levantarPrimeiroAcesso({});
    assert.equal(linhas.find((l) => l.userId === admin.id), undefined);
  });

  it("desativado fica de fora", async () => {
    const pessoa = await criarFuncionario({ ativo: false });
    const { linhas } = await levantarPrimeiroAcesso({});
    assert.equal(linhas.find((l) => l.userId === pessoa.id), undefined);
  });

  /**
   * A ordem é de cobrança, não alfabética: quem está parado há mais tempo vem
   * primeiro. Uma senha entregue há dois meses e nunca usada é um problema
   * diferente de uma entregue ontem, e a lista precisa dizer isso sem que
   * ninguém reordene coluna nenhuma.
   */
  it("quem está parado há mais tempo aparece antes", async () => {
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    const antiga = await criarFuncionario();
    const recente = await criarFuncionario();
    await matricular(antiga.id, curso.id);
    await matricular(recente.id, curso.id);

    await db.user.update({
      where: { id: antiga.id },
      data: { createdAt: new Date(Date.now() - 60 * DIA) },
    });

    const { linhas } = await levantarPrimeiroAcesso({});
    const somenteEstas = linhas.filter((l) => [antiga.id, recente.id].includes(l.userId));

    assert.equal(somenteEstas[0].userId, antiga.id, "a mais antiga vem primeiro");
    assert.ok(somenteEstas[0].diasDesdeCadastro >= 60);
  });

  it("o resumo soma o que as linhas dizem", async () => {
    const { linhas, resumo } = await levantarPrimeiroAcesso({});
    assert.equal(
      resumo.sem_curso + resumo.nunca_entrou + resumo.entrou_sem_comecar + resumo.ativo,
      resumo.total,
      "as quatro situações têm de somar o total"
    );
    assert.equal(resumo.total, linhas.length);
    assert.deepEqual(resumirAcessos(linhas), resumo);
  });

  it("o filtro por departamento restringe a lista", async () => {
    const setor = await db.department.create({ data: { name: `Setor ${Date.now()}` } });
    const dentro = await criarFuncionario({ departmentId: setor.id });
    const fora = await criarFuncionario();

    const { linhas } = await levantarPrimeiroAcesso({ departamentoId: setor.id });

    assert.ok(linhas.some((l) => l.userId === dentro.id));
    assert.equal(linhas.find((l) => l.userId === fora.id), undefined);
  });
});
