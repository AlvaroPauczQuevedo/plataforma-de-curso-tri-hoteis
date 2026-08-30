import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  criarAdministrador,
  criarCurso,
  criarFuncionario,
  db,
  encerrar,
} from "./ambiente";
import {
  sincronizarCurso,
  sincronizarTudo,
  sincronizarUsuario,
} from "../src/lib/matricula-automatica";

after(encerrar);

let contador = 0;
async function criarDepartamento() {
  contador += 1;
  return db.department.create({ data: { name: `Departamento ${contador}` } });
}

async function marcarObrigatorio(
  courseId: string,
  departmentId: string,
  prazoDias: number | null = null
) {
  return db.cursoObrigatorio.create({ data: { courseId, departmentId, prazoDias } });
}

const matriculasDe = (courseId: string) =>
  db.enrollment.findMany({ where: { courseId } });

describe("Matrícula automática por departamento", () => {
  it("matricula todo o departamento ao marcar o curso como obrigatório", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    const a = await criarFuncionario({ departmentId: dep.id });
    const b = await criarFuncionario({ departmentId: dep.id });
    await criarFuncionario(); // de outro departamento, não deve entrar

    await marcarObrigatorio(curso.id, dep.id);
    const r = await sincronizarCurso(curso.id, admin.id);

    assert.equal(r.criadas, 2);
    const ids = (await matriculasDe(curso.id)).map((m) => m.userId).sort();
    assert.deepEqual(ids, [a.id, b.id].sort());
  });

  it("marca as matrículas criadas como obrigatórias", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await criarFuncionario({ departmentId: dep.id });

    await marcarObrigatorio(curso.id, dep.id);
    await sincronizarCurso(curso.id, admin.id);

    const [matricula] = await matriculasDe(curso.id);
    assert.equal(matricula.mandatory, true);
  });

  it("o prazo é contado a partir da matrícula", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await criarFuncionario({ departmentId: dep.id });

    await marcarObrigatorio(curso.id, dep.id, 30);
    await sincronizarCurso(curso.id, admin.id);

    const [matricula] = await matriculasDe(curso.id);
    assert.ok(matricula.dueDate, "tem prazo");
    const dias = (matricula.dueDate!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    assert.ok(dias > 29 && dias <= 30, `esperado ~30 dias, veio ${dias}`);
  });

  it("sem prazo definido, a matrícula fica sem data limite", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await criarFuncionario({ departmentId: dep.id });

    await marcarObrigatorio(curso.id, dep.id, null);
    await sincronizarCurso(curso.id, admin.id);

    const [matricula] = await matriculasDe(curso.id);
    assert.equal(matricula.dueDate, null);
  });
});

describe("Idempotência", () => {
  /**
   * A sincronização roda em vários gatilhos — ao marcar, ao cadastrar alguém,
   * ao clicar em "sincronizar". Duplicar matrícula a cada passagem seria o
   * defeito mais provável, e o mais chato de perceber.
   */
  it("rodar duas vezes não duplica matrícula", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await criarFuncionario({ departmentId: dep.id });

    await marcarObrigatorio(curso.id, dep.id);
    const primeira = await sincronizarCurso(curso.id, admin.id);
    const segunda = await sincronizarCurso(curso.id, admin.id);

    assert.equal(primeira.criadas, 1);
    assert.equal(segunda.criadas, 0, "a segunda passagem não cria nada");
    assert.equal((await matriculasDe(curso.id)).length, 1);
  });

  it("não mexe em quem já estava matriculado por fora", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    const pessoa = await criarFuncionario({ departmentId: dep.id });

    const prazoOriginal = new Date("2027-01-01");
    await db.enrollment.create({
      data: {
        userId: pessoa.id,
        courseId: curso.id,
        mandatory: false,
        dueDate: prazoOriginal,
        assignedById: admin.id,
      },
    });

    await marcarObrigatorio(curso.id, dep.id, 7);
    const r = await sincronizarCurso(curso.id, admin.id);

    assert.equal(r.criadas, 0);
    const [matricula] = await matriculasDe(curso.id);
    assert.equal(matricula.mandatory, false, "não sobrescreve a matrícula existente");
    assert.equal(matricula.dueDate?.getTime(), prazoOriginal.getTime());
  });
});

describe("Quem entra e quem sai", () => {
  it("quem é cadastrado depois entra pelo próprio gatilho", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    await marcarObrigatorio(curso.id, dep.id);
    await sincronizarCurso(curso.id, admin.id);
    assert.equal((await matriculasDe(curso.id)).length, 0, "ainda não há ninguém");

    const novo = await criarFuncionario({ departmentId: dep.id });
    const r = await sincronizarUsuario(novo.id, admin.id);

    assert.equal(r.criadas, 1);
  });

  it("funcionário inativo não é matriculado", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    const inativo = await criarFuncionario({ departmentId: dep.id });
    await db.user.update({ where: { id: inativo.id }, data: { active: false } });

    await marcarObrigatorio(curso.id, dep.id);
    const r = await sincronizarCurso(curso.id, admin.id);

    assert.equal(r.criadas, 0);
  });

  /**
   * Administradores gerenciam o treinamento; matriculá-los automaticamente
   * encheria o portal deles com os cursos que eles mesmos publicaram.
   */
  it("administrador do departamento não é matriculado automaticamente", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const gestor = await criarAdministrador();
    await db.user.update({ where: { id: gestor.id }, data: { departmentId: dep.id } });
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    await marcarObrigatorio(curso.id, dep.id);
    const r = await sincronizarCurso(curso.id, admin.id);

    assert.equal(r.criadas, 0);
  });

  it("funcionário sem departamento não entra em nada", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    const solto = await criarFuncionario();

    await marcarObrigatorio(curso.id, dep.id);
    const r = await sincronizarUsuario(solto.id, admin.id);

    assert.equal(r.criadas, 0);
  });

  /**
   * Retirar a obrigatoriedade não desmatricula: quem já concluiu tem progresso
   * e certificado, e apagar isso seria a operação mais destrutiva possível.
   */
  it("retirar a obrigatoriedade não remove quem já estava matriculado", async () => {
    const admin = await criarAdministrador();
    const dep = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await criarFuncionario({ departmentId: dep.id });

    await marcarObrigatorio(curso.id, dep.id);
    await sincronizarCurso(curso.id, admin.id);
    assert.equal((await matriculasDe(curso.id)).length, 1);

    await db.cursoObrigatorio.deleteMany({ where: { courseId: curso.id } });

    assert.equal(
      (await matriculasDe(curso.id)).length,
      1,
      "a matrícula sobrevive à retirada da obrigatoriedade"
    );
  });
});

describe("Sincronização geral", () => {
  it("cobre vários cursos e departamentos de uma vez", async () => {
    const admin = await criarAdministrador();
    const depA = await criarDepartamento();
    const depB = await criarDepartamento();
    const { curso: cursoA } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    const { curso: cursoB } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    await criarFuncionario({ departmentId: depA.id });
    await criarFuncionario({ departmentId: depA.id });
    await criarFuncionario({ departmentId: depB.id });

    await marcarObrigatorio(cursoA.id, depA.id);
    await marcarObrigatorio(cursoB.id, depB.id);

    const r = await sincronizarTudo(admin.id);

    assert.equal(r.criadas, 3);
    assert.equal((await matriculasDe(cursoA.id)).length, 2);
    assert.equal((await matriculasDe(cursoB.id)).length, 1);
  });

  it("um curso obrigatório em dois departamentos alcança os dois", async () => {
    const admin = await criarAdministrador();
    const depA = await criarDepartamento();
    const depB = await criarDepartamento();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    await criarFuncionario({ departmentId: depA.id });
    await criarFuncionario({ departmentId: depB.id });

    await marcarObrigatorio(curso.id, depA.id);
    await marcarObrigatorio(curso.id, depB.id);

    const r = await sincronizarCurso(curso.id, admin.id);
    assert.equal(r.criadas, 2);
  });
});
