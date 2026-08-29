/**
 * Remove da plataforma os funcionários que vieram da intranet.
 *
 * Foram importados numa prova de integração e são o cadastro de DEMONSTRAÇÃO
 * daquele sistema — pessoas que não existem. Deixá-los aqui levaria alguém a
 * matriculá-los em treinamentos reais.
 *
 * Só é apagado quem tem `intranetEmployeeId` preenchido, ou seja, quem nasceu
 * da sincronização. Contas criadas nesta plataforma — administradores e
 * funcionários cadastrados pela tela — não são tocadas, nem seus cursos,
 * matrículas e certificados.
 *
 * Uso: npx tsx prisma/remover-importados-da-intranet.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const importados = await db.user.findMany({
    where: { NOT: { intranetEmployeeId: null } },
    select: { id: true, name: true },
  });

  if (importados.length === 0) {
    console.log("\nNenhum funcionário importado da intranet. Nada a fazer.\n");
    return;
  }

  const ids = importados.map((u) => u.id);

  // Dependências primeiro: o banco recusaria a exclusão com registros presos.
  const certificados = await db.certificate.deleteMany({ where: { userId: { in: ids } } });
  const progressoCurso = await db.courseProgress.deleteMany({ where: { userId: { in: ids } } });
  const progressoAula = await db.lessonProgress.deleteMany({ where: { userId: { in: ids } } });
  const matriculas = await db.enrollment.deleteMany({ where: { userId: { in: ids } } });
  await db.enrollment.updateMany({
    where: { assignedById: { in: ids } },
    data: { assignedById: null },
  });
  const acessos = await db.accessLog.deleteMany({ where: { userId: { in: ids } } });
  const tokens = await db.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });

  const removidos = await db.user.deleteMany({ where: { id: { in: ids } } });

  // Departamentos que só existiam por causa deles.
  const vazios = await db.department.findMany({
    where: { users: { none: {} } },
    select: { id: true, name: true },
  });
  if (vazios.length > 0) {
    await db.department.deleteMany({ where: { id: { in: vazios.map((d) => d.id) } } });
  }

  const [usuarios, admins, cursos, matriculasRestantes, departamentos] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "ADMIN" } }),
    db.course.count(),
    db.enrollment.count(),
    db.department.count(),
  ]);

  console.log("\nLimpeza concluída.\n");
  console.log(`  Funcionários importados removidos: ${removidos.count}`);
  console.log(
    `  Registros dependentes: ${matriculas.count} matrícula(s), ${progressoCurso.count} progresso(s) de curso, ` +
      `${progressoAula.count} de aula, ${certificados.count} certificado(s), ${acessos.count} acesso(s), ${tokens.count} token(s)`
  );
  console.log(`  Departamentos vazios removidos: ${vazios.length}`);
  if (vazios.length > 0) console.log(`    ${vazios.map((d) => d.name).join(", ")}`);
  console.log("");
  console.log(`  Restam: ${usuarios} usuário(s), sendo ${admins} administrador(es)`);
  console.log(`  Preservados: ${cursos} curso(s), ${matriculasRestantes} matrícula(s), ${departamentos} departamento(s)\n`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
