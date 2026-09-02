/**
 * Prepara um banco recém-semeado para o teste de fumaça.
 *
 * O `prisma db seed` cria funcionários, cursos e certificados, mas não cria
 * prova nenhuma — e nenhum administrador dele é proprietário. Sem estes dois
 * ajustes, a fumaça não alcança sete telas: as quatro exclusivas do
 * proprietário (relatórios, atividades, erros, configurações) e as três de
 * prova, que é justamente onde mora a regra de alcance mais delicada da
 * plataforma.
 *
 * Existe como script, e não como passo solto no CI, porque o cenário precisa
 * ser o MESMO toda vez: um teste de fumaça que cobre telas diferentes a cada
 * execução não diz se algo quebrou, diz só o que ele resolveu visitar.
 *
 * Idempotente: rodar duas vezes no mesmo banco não duplica nada.
 *
 * Uso:
 *   DATABASE_URL=file:/caminho/do/banco.db node scripts/preparar-fumaca.mjs
 *
 * Imprime linhas CHAVE=valor, prontas para alimentar o ambiente do CI.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SETOR_ALHEIO = "Equipe de outro setor (fumaça)";
const PROVAS = {
  geral: "Avaliação geral (fumaça)",
  doSetor: "Avaliação do setor (fumaça)",
  porCurso: "Avaliação de outro setor, aplicada por curso (fumaça)",
};

/**
 * O administrador vira proprietário.
 *
 * As telas de relatórios, atividades, erros e configurações devolvem "página
 * não encontrada" para administrador comum — de propósito. Sem promover
 * alguém, a fumaça as contaria como falha sem que nada esteja errado.
 */
async function promoverProprietario() {
  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("Nenhum administrador no banco. Rode o seed antes.");

  if (!admin.protegido) {
    await db.user.update({ where: { id: admin.id }, data: { protegido: true } });
  }
  return admin;
}

/** Uma prova publicada, com uma questão respondível. */
async function garantirProva(titulo, departmentId, createdById) {
  const existente = await db.prova.findFirst({ where: { titulo } });
  if (existente) return existente;

  return db.prova.create({
    data: {
      titulo,
      departmentId,
      publicada: true,
      createdById,
      questoes: {
        create: {
          enunciado: "Esta questão existe para o teste de fumaça. Marque a primeira.",
          ordem: 0,
          alternativas: {
            create: [
              { texto: "Primeira alternativa", correta: true, ordem: 0 },
              { texto: "Segunda alternativa", correta: false, ordem: 1 },
            ],
          },
        },
      },
    },
  });
}

async function main() {
  const admin = await promoverProprietario();

  /*
    Um funcionário que JÁ tem matrícula. É por ela que a fumaça alcança a tela
    do curso, a da aula e — pela porta "por curso" do alcance — a prova de
    outro setor, que é o caso que já esteve quebrado.
  */
  const matricula = await db.enrollment.findFirst({
    where: { user: { role: "EMPLOYEE", active: true } },
    include: { user: true },
    orderBy: { assignedAt: "asc" },
  });
  if (!matricula) {
    throw new Error("Nenhuma matrícula no banco. Rode o seed antes.");
  }
  const funcionario = matricula.user;

  const alheio =
    (await db.department.findFirst({ where: { name: SETOR_ALHEIO } })) ??
    (await db.department.create({ data: { name: SETOR_ALHEIO } }));

  await garantirProva(PROVAS.geral, null, admin.id);
  await garantirProva(PROVAS.doSetor, funcionario.departmentId, admin.id);
  const porCurso = await garantirProva(PROVAS.porCurso, alheio.id, admin.id);

  /*
    A terceira prova é de um setor que não é o do funcionário. Ele só a alcança
    porque ela é aula de um curso em que está matriculado — a segunda porta da
    regra de alcance. Sem esta aula, o caso não é exercitado por ninguém.
  */
  const jaAplicada = await db.lesson.findFirst({
    where: { provaId: porCurso.id, module: { courseId: matricula.courseId } },
  });

  if (!jaAplicada) {
    const modulo = await db.module.create({
      data: {
        courseId: matricula.courseId,
        title: "Avaliação final (fumaça)",
        order: 999,
      },
    });
    await db.lesson.create({
      data: {
        moduleId: modulo.id,
        title: "Prova de encerramento (fumaça)",
        order: 0,
        type: "PROVA",
        provaId: porCurso.id,
      },
    });
  }

  /* Um vídeo qualquer, para exercitar a entrega por trecho em /api/files. */
  const video = await db.fileAsset.findFirst({ where: { kind: "VIDEO" } });
  const certificado = await db.certificate.findFirst({ include: { user: true } });

  /*
    Um segundo funcionário, que NÃO é dono do certificado acima. É com ele que
    se prova a recusa: sem alguém para tomar o 403, o teste do PDF confirmaria
    apenas que o download funciona, e não que ele é restrito ao dono.
  */
  const outro = await db.user.findFirst({
    where: {
      role: "EMPLOYEE",
      active: true,
      mustChangePassword: false,
      id: { not: certificado?.userId ?? "-" },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`FUMACA_ADMIN=${admin.email}`);
  console.log(`FUMACA_FUNCIONARIO=${funcionario.email}`);
  console.log(`FUMACA_VIDEO_ID=${video?.id ?? ""}`);
  console.log(`FUMACA_CERT_ID=${certificado?.id ?? ""}`);
  console.log(`FUMACA_CERT_DONO=${certificado?.user.email ?? ""}`);
  console.log(`FUMACA_CERT_ESTRANHO=${outro?.email ?? ""}`);
  console.log(`FUMACA_PROVA_ID=${porCurso.id}`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}
