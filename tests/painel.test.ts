import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { criarCurso, criarFuncionario, db, encerrar } from "./ambiente";

// Depois do ambiente, que já apontou DATABASE_URL para o banco temporário.
import { getDashboardStats } from "../src/lib/admin-data";

after(encerrar);

/**
 * Os números do painel.
 *
 * Eles acabaram de deixar de ser contados em JavaScript sobre a tabela inteira
 * e passaram a ser agregações no banco. É a troca que mais fácil muda um
 * número sem ninguém perceber — uma contagem que passa a incluir o limite, uma
 * média que divide por outro denominador —, e é a primeira tela que todo
 * administrador abre. Então o cenário abaixo é montado à mão e cada indicador
 * é conferido contra o valor que dá para calcular de cabeça.
 *
 * O banco deste arquivo é exclusivo dele, então as contagens globais são
 * exatamente o que este cenário criou.
 */

let setorNome: string;
let curso1Id: string;
let anaId: string;

before(async () => {
  const setor = await db.department.create({ data: { name: "Recepção" } });
  setorNome = setor.name;

  const ana = await criarFuncionario({ departmentId: setor.id });
  const bruno = await criarFuncionario({ departmentId: setor.id });
  const carla = await criarFuncionario({ departmentId: setor.id });
  anaId = ana.id;

  const { curso: curso1 } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
  const { curso: curso2 } = await criarCurso({ aulas: [{ tipo: "TEXT" }] });
  curso1Id = curso1.id;

  const ontem = new Date(Date.now() - 86_400_000);

  await db.enrollment.createMany({
    data: [
      // Ana: dois cursos, os dois com prazo vencido. É UMA pessoa atrasada.
      { userId: ana.id, courseId: curso1.id, dueDate: ontem },
      { userId: ana.id, courseId: curso2.id, dueDate: ontem },
      // Bruno: prazo vencido, mas concluído — não conta como atraso.
      { userId: bruno.id, courseId: curso1.id, dueDate: ontem },
      // Carla: sem prazo.
      { userId: carla.id, courseId: curso1.id },
    ],
  });

  await db.courseProgress.createMany({
    data: [
      { userId: ana.id, courseId: curso1.id, percent: 50 },
      { userId: bruno.id, courseId: curso1.id, percent: 100 },
      { userId: carla.id, courseId: curso1.id, percent: 0 },
    ],
  });
});

describe("Contagens de gente e de curso", () => {
  it("conta só funcionários, nunca administradores", async () => {
    /*
      As fábricas do ambiente criam um administrador para ser autor dos cursos.
      Se ele entrasse na conta, o indicador divergiria do gráfico por
      departamento, que já filtra por EMPLOYEE.
    */
    const stats = await getDashboardStats();

    assert.equal(stats.totalEmployees, 3);
    assert.equal(stats.activeEmployees, 3);
  });

  it("conta os cursos publicados e as matrículas", async () => {
    const stats = await getDashboardStats();

    assert.equal(stats.publishedCourses, 2);
    assert.equal(stats.totalEnrollments, 4);
  });
});

describe("Progresso", () => {
  it("separa em andamento de concluído pelas bordas certas", async () => {
    // 0% não é "em andamento"; 100% é "concluído" e não os dois.
    const stats = await getDashboardStats();

    assert.equal(stats.inProgress, 1); // só a Ana, com 50%
    assert.equal(stats.completed, 1); // só o Bruno, com 100%
  });

  it("a média é sobre os progressos registrados", async () => {
    const stats = await getDashboardStats();

    // (50 + 100 + 0) / 3
    assert.equal(stats.avgCompletion, 50);
  });

  it("não iniciados é o que sobra das matrículas", async () => {
    const stats = await getDashboardStats();
    const naoIniciados = stats.statusBreakdown.find((s) => s.name === "Não iniciados");

    assert.equal(naoIniciados!.value, 2); // 4 matrículas - 1 andando - 1 concluída
  });
});

describe("Atrasados", () => {
  it("conta PESSOAS, não matrículas vencidas", async () => {
    /*
      A Ana tem dois cursos vencidos e continua sendo uma pessoa atrasada.
      Contar matrículas daria 2 e o número não se defenderia numa reunião.
    */
    const stats = await getDashboardStats();

    assert.equal(stats.overdueCount, 1);
  });

  it("prazo vencido com o curso concluído não é atraso", async () => {
    // O Bruno tem prazo vencido e 100%: terminou, ainda que no limite.
    const stats = await getDashboardStats();
    assert.equal(stats.overdueCount, 1);

    // Se a Ana concluir os dois, o indicador precisa zerar.
    await db.courseProgress.updateMany({
      where: { userId: anaId },
      data: { percent: 100 },
    });
    const cursos = await db.enrollment.findMany({
      where: { userId: anaId },
      select: { courseId: true },
    });
    for (const { courseId } of cursos) {
      await db.courseProgress.upsert({
        where: { userId_courseId: { userId: anaId, courseId } },
        create: { userId: anaId, courseId, percent: 100 },
        update: { percent: 100 },
      });
    }

    assert.equal((await getDashboardStats()).overdueCount, 0);

    // Devolve o cenário ao estado original para não contaminar o resto.
    await db.courseProgress.update({
      where: { userId_courseId: { userId: anaId, courseId: curso1Id } },
      data: { percent: 50 },
    });
    await db.courseProgress.deleteMany({
      where: { userId: anaId, courseId: { not: curso1Id } },
    });
  });
});

describe("Listas do painel", () => {
  it("o curso mais matriculado vem primeiro, com a contagem certa", async () => {
    const stats = await getDashboardStats();

    assert.equal(stats.mostAccessed[0]!.course.id, curso1Id);
    assert.equal(stats.mostAccessed[0]!.count, 3);
    assert.equal(stats.mostAccessed.length, 2);
  });

  it("o gráfico por departamento deixa de fora setor sem ninguém", async () => {
    await db.department.create({ data: { name: "Setor vazio" } });

    const stats = await getDashboardStats();

    assert.deepEqual(stats.departmentCounts, [{ name: setorNome, total: 3 }]);
  });
});
