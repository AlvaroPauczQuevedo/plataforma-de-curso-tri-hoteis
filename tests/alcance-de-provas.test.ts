import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  criarAdministrador,
  criarCurso,
  criarFuncionario,
  db,
  encerrar,
  matricular,
} from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import {
  departamentosDoUsuario,
  filtroDeProvasDoUsuario,
  usuarioAlcancaProva,
} from "../src/lib/alcance-de-provas";

after(encerrar);

/**
 * Quem alcança qual prova.
 *
 * A regra vivia copiada em quatro telas, e as cópias já discordavam entre si:
 * nenhuma enxergava departamento adicional, e a tela de fazer a prova recusava
 * quem a entrega aceitava. Estes testes existem para que as duas leituras da
 * regra — a que LISTA e a que CONFERE — não voltem a divergir.
 */

let contador = 0;
const unico = (prefixo: string) => `${prefixo} ${(contador += 1)}`;

async function criarDepartamento() {
  return db.department.create({ data: { name: unico("Setor") } });
}

async function criarProva(departmentId: string | null) {
  const autor = await criarAdministrador();
  return db.prova.create({
    data: {
      titulo: unico("Prova"),
      departmentId,
      publicada: true,
      createdById: autor.id,
    },
  });
}

/** As provas que a lista do portal mostraria para esta pessoa. */
async function provasListadas(userId: string): Promise<Set<string>> {
  const departamentos = await departamentosDoUsuario(userId);
  const provas = await db.prova.findMany({
    where: { publicada: true, ...filtroDeProvasDoUsuario(userId, departamentos) },
    select: { id: true },
  });
  return new Set(provas.map((p) => p.id));
}

/** Curso com uma aula de prova apontando para a prova informada. */
async function cursoQueAplica(provaId: string) {
  const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "PROVA" }] });
  await db.lesson.update({ where: { id: aulas[0]!.id }, data: { provaId } });
  return curso;
}

describe("Departamentos de uma pessoa", () => {
  it("junta o principal e os adicionais, sem repetir", async () => {
    const principal = await criarDepartamento();
    const extra = await criarDepartamento();
    const pessoa = await criarFuncionario({ departmentId: principal.id });

    await db.departamentoExtra.create({
      data: { userId: pessoa.id, departmentId: extra.id },
    });
    // O principal repetido como adicional não deve aparecer duas vezes.
    await db.departamentoExtra.create({
      data: { userId: pessoa.id, departmentId: principal.id },
    });

    const departamentos = await departamentosDoUsuario(pessoa.id);

    assert.equal(departamentos.length, 2);
    assert.ok(departamentos.includes(principal.id));
    assert.ok(departamentos.includes(extra.id));
  });

  it("quem não tem departamento nenhum devolve lista vazia", async () => {
    const pessoa = await criarFuncionario();
    assert.deepEqual(await departamentosDoUsuario(pessoa.id), []);
  });
});

describe("Alcance por departamento", () => {
  it("prova geral alcança até quem não tem departamento", async () => {
    const pessoa = await criarFuncionario();
    const geral = await criarProva(null);

    assert.equal(await usuarioAlcancaProva(pessoa.id, geral), true);
    assert.ok((await provasListadas(pessoa.id)).has(geral.id));
  });

  it("prova do departamento principal alcança", async () => {
    const setor = await criarDepartamento();
    const pessoa = await criarFuncionario({ departmentId: setor.id });
    const prova = await criarProva(setor.id);

    assert.equal(await usuarioAlcancaProva(pessoa.id, prova), true);
    assert.ok((await provasListadas(pessoa.id)).has(prova.id));
  });

  it("prova de departamento ADICIONAL alcança", async () => {
    /*
      O caso que estava quebrado. Quem atua em dois setores já era matriculado
      automaticamente no treinamento obrigatório dos dois, mas a prova do
      segundo setor não aparecia na lista nem podia ser entregue.
    */
    const principal = await criarDepartamento();
    const extra = await criarDepartamento();
    const pessoa = await criarFuncionario({ departmentId: principal.id });
    await db.departamentoExtra.create({
      data: { userId: pessoa.id, departmentId: extra.id },
    });

    const prova = await criarProva(extra.id);

    assert.equal(await usuarioAlcancaProva(pessoa.id, prova), true);
    assert.ok((await provasListadas(pessoa.id)).has(prova.id));
  });

  it("prova de outro departamento não alcança", async () => {
    const meu = await criarDepartamento();
    const alheio = await criarDepartamento();
    const pessoa = await criarFuncionario({ departmentId: meu.id });
    const prova = await criarProva(alheio.id);

    assert.equal(await usuarioAlcancaProva(pessoa.id, prova), false);
    assert.ok(!(await provasListadas(pessoa.id)).has(prova.id));
  });
});

describe("Alcance pelo curso", () => {
  it("prova de outro setor alcança quem está matriculado no curso que a aplica", async () => {
    /*
      Matrícula atravessa departamento: um curso pode ter aluno de outro setor,
      e a prova daquele curso precisa valer para ele. Sem esta porta, a pessoa
      via a prova na aula e tomava recusa ao entregar.
    */
    const alheio = await criarDepartamento();
    const meu = await criarDepartamento();
    const pessoa = await criarFuncionario({ departmentId: meu.id });
    const prova = await criarProva(alheio.id);
    const curso = await cursoQueAplica(prova.id);

    // Sem matrícula, não alcança.
    assert.equal(await usuarioAlcancaProva(pessoa.id, prova), false);

    await matricular(pessoa.id, curso.id);

    assert.equal(await usuarioAlcancaProva(pessoa.id, prova), true);
    assert.ok((await provasListadas(pessoa.id)).has(prova.id));
  });

  it("a aula de prova de um curso alheio não abre a prova para quem não se matriculou", async () => {
    const alheio = await criarDepartamento();
    const prova = await criarProva(alheio.id);
    await cursoQueAplica(prova.id);

    const estranho = await criarFuncionario();

    assert.equal(await usuarioAlcancaProva(estranho.id, prova), false);
    assert.ok(!(await provasListadas(estranho.id)).has(prova.id));
  });
});

describe("Listar e conferir não podem discordar", () => {
  it("toda prova listada é entregável, e nenhuma recusada aparece na lista", async () => {
    /*
      A invariante que justifica o módulo existir. Discordância entre as duas
      leituras aparece do pior jeito possível para quem usa: a prova listada,
      aberta, respondida — e a recusa só no clique de entregar.
    */
    const meu = await criarDepartamento();
    const extra = await criarDepartamento();
    const alheio = await criarDepartamento();

    const pessoa = await criarFuncionario({ departmentId: meu.id });
    await db.departamentoExtra.create({
      data: { userId: pessoa.id, departmentId: extra.id },
    });

    const daMinha = await criarProva(meu.id);
    const doExtra = await criarProva(extra.id);
    const geral = await criarProva(null);
    const doAlheio = await criarProva(alheio.id);
    const porCurso = await criarProva(alheio.id);
    const curso = await cursoQueAplica(porCurso.id);
    await matricular(pessoa.id, curso.id);

    const listadas = await provasListadas(pessoa.id);
    const todas = [daMinha, doExtra, geral, doAlheio, porCurso];

    for (const prova of todas) {
      const alcanca = await usuarioAlcancaProva(pessoa.id, prova);
      assert.equal(
        listadas.has(prova.id),
        alcanca,
        `${prova.titulo}: a lista e a conferência discordaram`
      );
    }

    // E o resultado esperado, para o teste não passar com as duas erradas.
    assert.ok(listadas.has(daMinha.id));
    assert.ok(listadas.has(doExtra.id));
    assert.ok(listadas.has(geral.id));
    assert.ok(listadas.has(porCurso.id));
    assert.ok(!listadas.has(doAlheio.id));
  });
});
