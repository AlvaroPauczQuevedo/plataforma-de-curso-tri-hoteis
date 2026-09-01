import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  concluirAula,
  criarCurso,
  criarFuncionario,
  db,
  encerrar,
  matricular,
} from "./ambiente";

// Estes imports vêm DEPOIS de ./ambiente.ts de propósito: os módulos abaixo
// carregam o cliente Prisma da aplicação, que lê DATABASE_URL ao ser avaliado.
// O ambiente já apontou a variável para o banco temporário.
import {
  recalculateCourseProgress,
  ressincronizarProgressoDoCurso,
} from "../src/lib/progress";
import { isLessonUnlocked, userHasCourseAccess } from "../src/lib/access";

after(encerrar);

describe("Progresso do curso", () => {
  it("o percentual vem das aulas obrigatórias concluídas", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }, { tipo: "TEXT" }, { tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);

    await concluirAula(aluno.id, aulas[0]!.id);
    const um = await recalculateCourseProgress(aluno.id, curso.id);
    assert.equal(um!.courseProgress.percent, 25);

    await concluirAula(aluno.id, aulas[1]!.id);
    const dois = await recalculateCourseProgress(aluno.id, curso.id);
    assert.equal(dois!.courseProgress.percent, 50);
  });

  it("aula opcional não entra na conta", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }, { tipo: "TEXT", obrigatoria: false }],
    });
    await matricular(aluno.id, curso.id);

    await concluirAula(aluno.id, aulas[0]!.id);
    await concluirAula(aluno.id, aulas[1]!.id);
    const resultado = await recalculateCourseProgress(aluno.id, curso.id);

    assert.equal(resultado!.total, 2, "só as obrigatórias contam");
    assert.equal(resultado!.courseProgress.percent, 100);
    assert.equal(resultado!.isComplete, true);
  });

  it("o progresso de um aluno não interfere no de outro", async () => {
    const [ana, bruno] = [await criarFuncionario(), await criarFuncionario()];
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }] });
    await matricular(ana.id, curso.id);
    await matricular(bruno.id, curso.id);

    await concluirAula(ana.id, aulas[0]!.id);
    await recalculateCourseProgress(ana.id, curso.id);
    const doBruno = await recalculateCourseProgress(bruno.id, curso.id);

    assert.equal(doBruno!.courseProgress.percent, 0);
  });

  it("curso sem aulas obrigatórias fica em 0% e não conclui", async () => {
    const aluno = await criarFuncionario();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT", obrigatoria: false }] });
    await matricular(aluno.id, curso.id);

    const resultado = await recalculateCourseProgress(aluno.id, curso.id);
    assert.equal(resultado!.courseProgress.percent, 0);
    assert.equal(resultado!.isComplete, false, "0 de 0 não é conclusão");
  });
});

describe("Certificado", () => {
  it("é emitido sozinho ao chegar a 100%", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await matricular(aluno.id, curso.id);

    assert.equal(
      await db.certificate.count({ where: { userId: aluno.id, courseId: curso.id } }),
      0
    );

    await concluirAula(aluno.id, aulas[0]!.id);
    await recalculateCourseProgress(aluno.id, curso.id);

    const certificado = await db.certificate.findFirst({
      where: { userId: aluno.id, courseId: curso.id },
    });
    assert.ok(certificado, "certificado emitido ao concluir");
    assert.match(certificado!.code, /^CERT-/);
  });

  it("recalcular várias vezes não duplica o certificado", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await matricular(aluno.id, curso.id);
    await concluirAula(aluno.id, aulas[0]!.id);

    for (let i = 0; i < 5; i += 1) await recalculateCourseProgress(aluno.id, curso.id);

    assert.equal(
      await db.certificate.count({ where: { userId: aluno.id, courseId: curso.id } }),
      1
    );
  });

  it("curso sem certificado habilitado não emite nada", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      certificado: false,
      aulas: [{ tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);
    await concluirAula(aluno.id, aulas[0]!.id);

    const resultado = await recalculateCourseProgress(aluno.id, curso.id);
    assert.equal(resultado!.isComplete, true);
    assert.equal(
      await db.certificate.count({ where: { userId: aluno.id, courseId: curso.id } }),
      0
    );
  });

  it("a data de conclusão não muda a cada recálculo", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await matricular(aluno.id, curso.id);
    await concluirAula(aluno.id, aulas[0]!.id);

    await recalculateCourseProgress(aluno.id, curso.id);
    const primeira = (
      await db.courseProgress.findUnique({
        where: { userId_courseId: { userId: aluno.id, courseId: curso.id } },
      })
    )!.completedAt;

    await new Promise((r) => setTimeout(r, 20));
    await recalculateCourseProgress(aluno.id, curso.id);
    const segunda = (
      await db.courseProgress.findUnique({
        where: { userId_courseId: { userId: aluno.id, courseId: curso.id } },
      })
    )!.completedAt;

    assert.deepEqual(segunda, primeira, "a conclusão original é preservada");
  });
});

describe("Ordem obrigatória das aulas", () => {
  it("a segunda aula fica bloqueada até a primeira ser concluída", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      sequencial: true,
      aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }, { tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);

    assert.equal(await isLessonUnlocked(aluno.id, aulas[0]!.id), true, "a primeira sempre abre");
    assert.equal(await isLessonUnlocked(aluno.id, aulas[1]!.id), false);
    assert.equal(await isLessonUnlocked(aluno.id, aulas[2]!.id), false);

    await concluirAula(aluno.id, aulas[0]!.id);
    assert.equal(await isLessonUnlocked(aluno.id, aulas[1]!.id), true);
    assert.equal(await isLessonUnlocked(aluno.id, aulas[2]!.id), false, "não libera em cascata");
  });

  it("sem ordem obrigatória, todas as aulas abrem", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      sequencial: false,
      aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);

    assert.equal(await isLessonUnlocked(aluno.id, aulas[1]!.id), true);
  });

  it("aula opcional anterior não bloqueia a seguinte", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      sequencial: true,
      aulas: [{ tipo: "TEXT", obrigatoria: false }, { tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);

    assert.equal(await isLessonUnlocked(aluno.id, aulas[1]!.id), true);
  });
});

describe("Acesso ao curso", () => {
  it("sem matrícula não há acesso", async () => {
    const aluno = await criarFuncionario();
    const { curso } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });

    assert.equal(await userHasCourseAccess(aluno.id, curso.id), false);
    await matricular(aluno.id, curso.id);
    assert.equal(await userHasCourseAccess(aluno.id, curso.id), true);
  });
});

describe("Aula do tipo prova", () => {
  it("aula de prova obrigatória segura a conclusão até ser concluída", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      aulas: [{ tipo: "TEXT" }, { tipo: "PROVA" }],
    });
    await matricular(aluno.id, curso.id);

    await concluirAula(aluno.id, aulas[0]!.id);
    const parcial = await recalculateCourseProgress(aluno.id, curso.id);
    assert.equal(parcial!.courseProgress.percent, 50);
    assert.equal(parcial!.courseProgress.completedAt, null);

    // É o que a aprovação na prova faz: marca a aula como concluída.
    await concluirAula(aluno.id, aulas[1]!.id);
    const final = await recalculateCourseProgress(aluno.id, curso.id);
    assert.equal(final!.courseProgress.percent, 100);
    assert.notEqual(final!.courseProgress.completedAt, null);
  });

  it("aula de prova opcional não impede a conclusão", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      aulas: [{ tipo: "TEXT" }, { tipo: "PROVA", obrigatoria: false }],
    });
    await matricular(aluno.id, curso.id);

    await concluirAula(aluno.id, aulas[0]!.id);
    const progresso = await recalculateCourseProgress(aluno.id, curso.id);

    assert.equal(progresso!.courseProgress.percent, 100);
    assert.notEqual(progresso!.courseProgress.completedAt, null);
  });
});

describe("Mudança de estrutura do curso", () => {
  it("acrescentar aula obrigatória tira de 100% quem já havia concluído", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);
    await concluirAula(aluno.id, aulas[0]!.id);
    await concluirAula(aluno.id, aulas[1]!.id);
    await recalculateCourseProgress(aluno.id, curso.id);

    const antes = await db.courseProgress.findUnique({
      where: { userId_courseId: { userId: aluno.id, courseId: curso.id } },
    });
    assert.equal(antes!.percent, 100);
    assert.notEqual(antes!.completedAt, null);

    // O curso ganha uma prova obrigatória depois que o aluno terminou.
    await db.lesson.create({
      data: {
        moduleId: aulas[0]!.moduleId,
        title: "Avaliação final",
        order: 2,
        type: "TEXT",
        required: true,
      },
    });

    await ressincronizarProgressoDoCurso(curso.id);

    const depois = await db.courseProgress.findUnique({
      where: { userId_courseId: { userId: aluno.id, courseId: curso.id } },
    });
    assert.equal(depois!.percent, 67);
    assert.equal(
      depois!.completedAt,
      null,
      "quem não fez a aula nova não pode continuar marcado como concluído"
    );
  });

  it("tornar a aula opcional devolve a conclusão", async () => {
    const aluno = await criarFuncionario();
    const { curso, aulas } = await criarCurso({
      aulas: [{ tipo: "TEXT" }, { tipo: "TEXT" }],
    });
    await matricular(aluno.id, curso.id);
    await concluirAula(aluno.id, aulas[0]!.id);
    await recalculateCourseProgress(aluno.id, curso.id);

    await db.lesson.update({
      where: { id: aulas[1]!.id },
      data: { required: false },
    });
    await ressincronizarProgressoDoCurso(curso.id);

    const progresso = await db.courseProgress.findUnique({
      where: { userId_courseId: { userId: aluno.id, courseId: curso.id } },
    });
    assert.equal(progresso!.percent, 100);
    assert.notEqual(progresso!.completedAt, null);
  });

  it("ressincronizar alcança todo mundo matriculado, não só quem mexeu na aula", async () => {
    const um = await criarFuncionario();
    const dois = await criarFuncionario();
    const { curso, aulas } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
    await matricular(um.id, curso.id);
    await matricular(dois.id, curso.id);
    await concluirAula(um.id, aulas[0]!.id);
    await concluirAula(dois.id, aulas[0]!.id);
    await recalculateCourseProgress(um.id, curso.id);
    await recalculateCourseProgress(dois.id, curso.id);

    await db.lesson.create({
      data: {
        moduleId: aulas[0]!.moduleId,
        title: "Aula nova",
        order: 1,
        type: "TEXT",
        required: true,
      },
    });

    const alcancados = await ressincronizarProgressoDoCurso(curso.id);
    assert.equal(alcancados, 2);

    for (const aluno of [um, dois]) {
      const progresso = await db.courseProgress.findUnique({
        where: { userId_courseId: { userId: aluno.id, courseId: curso.id } },
      });
      assert.equal(progresso!.percent, 50);
    }
  });
});
