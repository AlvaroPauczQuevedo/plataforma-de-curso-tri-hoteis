import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

const db = new PrismaClient();

const STORAGE_ROOT = path.join(process.cwd(), "storage", "uploads");
const SEED_VIDEO_PATH = path.join(STORAGE_ROOT, "videos", "seed-flower.mp4");

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function makePdf(title: string, lines: string[]) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: rgb(0.11, 0.1, 0.09) });
  page.drawText("Academia Corporativa Tri Hotéis", {
    x: 40,
    y: 810,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText(title, { x: 40, y: 750, size: 20, font: bold, color: rgb(0.11, 0.1, 0.09) });

  let y = 710;
  for (const line of lines) {
    page.drawText(line, { x: 40, y, size: 11, font: regular, color: rgb(0.34, 0.32, 0.31), maxWidth: 515 });
    y -= 24;
  }

  return pdfDoc.save();
}

async function createPdfAsset(uploaderId: string, title: string, lines: string[]) {
  const bytes = await makePdf(title, lines);
  const filename = `${randomUUID()}.pdf`;
  const dir = path.join(STORAGE_ROOT, "pdfs");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);

  return db.fileAsset.create({
    data: {
      filename,
      originalName: `${title}.pdf`,
      mimeType: "application/pdf",
      size: bytes.length,
      storagePath: path.join("pdfs", filename),
      kind: "PDF",
      uploadedById: uploaderId,
    },
  });
}

/**
 * Garante que exista o vídeo de apoio do seed.
 *
 * `storage/uploads` não é versionado — são arquivos grandes, e o .gitignore os
 * deixa de fora de propósito. O efeito colateral é que `npx prisma db seed`,
 * que o README manda rodar logo depois de clonar, quebrava em toda instalação
 * nova: o seed fazia `stat` num MP4 que nunca esteve no repositório e morria
 * com exit 1 antes de criar coisa alguma. Quem clonava não conseguia povoar o
 * ambiente de demonstração, e a mensagem de erro não dizia por quê.
 *
 * Se o vídeo de verdade estiver lá, é ele que vale. Se não estiver, o seed
 * escreve no lugar um MP4 mínimo — cabeçalho válido e nada mais. Ele não
 * reproduz imagem nenhuma, e não precisa: o que os dados de demonstração
 * exigem é um arquivo que exista, tenha tamanho e possa ser servido, para que
 * matrícula, progresso e certificado tenham o que exercitar. Trocar o
 * substituto por um vídeo real é copiar por cima.
 */
async function garantirVideoDeApoio() {
  await fs.mkdir(path.dirname(SEED_VIDEO_PATH), { recursive: true });

  try {
    await fs.stat(SEED_VIDEO_PATH);
    return;
  } catch {
    // Não existe. Segue e escreve o substituto.
  }

  // Caixa "ftyp": tamanho, tipo, marca principal e marcas compatíveis.
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
  ]);

  // Caixa "free": só para o arquivo ter algum corpo e um tamanho plausível.
  const free = Buffer.alloc(2048);
  free.writeUInt32BE(free.length, 0);
  free.write("free", 4, "ascii");

  await fs.writeFile(SEED_VIDEO_PATH, Buffer.concat([ftyp, free]));

  console.warn(
    "  [aviso] " +
      path.relative(process.cwd(), SEED_VIDEO_PATH) +
      " não existia — foi criado um MP4 mínimo, que não reproduz imagem." +
      " Copie um vídeo real por cima para ver as aulas de vídeo funcionando."
  );
}

async function createVideoAsset(uploaderId: string, originalName: string) {
  await garantirVideoDeApoio();

  const stat = await fs.stat(SEED_VIDEO_PATH);
  const filename = `${randomUUID()}.mp4`;
  const dir = path.join(STORAGE_ROOT, "videos");
  // O createPdfAsset já fazia isto; aqui faltava, e o destino pode não existir.
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(SEED_VIDEO_PATH, path.join(dir, filename));

  return db.fileAsset.create({
    data: {
      filename,
      originalName,
      mimeType: "video/mp4",
      size: stat.size,
      storagePath: path.join("videos", filename),
      kind: "VIDEO",
      uploadedById: uploaderId,
    },
  });
}

function randomCode(prefix: string) {
  const raw = Math.random().toString(36).slice(2, 8).toUpperCase();
  const stamp = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${stamp}${raw}`;
}

async function recalcCourseProgress(userId: string, courseId: string) {
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { modules: { include: { lessons: true } } },
  });

  const requiredLessons = course.modules.flatMap((m) => m.lessons).filter((l) => l.required);

  const done = await db.lessonProgress.findMany({
    where: { userId, lessonId: { in: requiredLessons.map((l) => l.id) }, completed: true },
  });

  const total = requiredLessons.length;
  const percent = total === 0 ? 0 : Math.round((done.length / total) * 100);
  const isComplete = total > 0 && done.length === total;

  await db.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: { userId, courseId, percent, completedAt: isComplete ? new Date() : null },
    update: { percent, completedAt: isComplete ? new Date() : null },
  });

  if (isComplete && course.certificateEnabled) {
    await db.certificate.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId, code: randomCode("CERT") },
      update: {},
    });
  }
}

async function main() {
  console.log("Limpando dados existentes...");
  await db.$transaction([
    db.adminActivityLog.deleteMany(),
    db.accessLog.deleteMany(),
    db.certificate.deleteMany(),
    db.courseProgress.deleteMany(),
    db.lessonProgress.deleteMany(),
    db.enrollment.deleteMany(),
    db.lesson.deleteMany(),
    db.module.deleteMany(),
    db.course.deleteMany(),
    db.category.deleteMany(),
    db.fileAsset.deleteMany(),
    db.passwordResetToken.deleteMany(),
    db.user.deleteMany(),
    db.department.deleteMany(),
  ]);

  console.log("Criando departamentos...");
  const [recepcao, governanca, alimentos, manutencao, rh, financeiro] = await Promise.all(
    ["Recepção", "Governança", "Alimentos e Bebidas", "Manutenção", "Recursos Humanos", "Financeiro"].map(
      (name) => db.department.create({ data: { name } })
    )
  );

  console.log("Criando categorias...");
  const [catSeguranca, catAtendimento, catCompliance, catLideranca, catOperacoes] = await Promise.all(
    [
      ["Segurança do Trabalho", "seguranca-do-trabalho"],
      ["Atendimento ao Cliente", "atendimento-ao-cliente"],
      ["Compliance", "compliance"],
      ["Liderança", "lideranca"],
      ["Operações", "operacoes"],
    ].map(([name, slug]) => db.category.create({ data: { name, slug } }))
  );

  console.log("Criando administrador...");
  const admin = await db.user.create({
    data: {
      name: "Ana Beatriz Ferreira",
      email: "admin@trihoteis.com.br",
      passwordHash: await hash("Admin@123"),
      role: "ADMIN",
      position: "Gerente de Treinamento e Desenvolvimento",
      departmentId: rh.id,
      lastLoginAt: new Date(),
    },
  });

  console.log("Criando funcionários...");
  const employeePassword = await hash("Colaborador@123");
  const employeesData = [
    { name: "Marina Costa", position: "Recepcionista", departmentId: recepcao.id },
    { name: "João Pereira", position: "Camareiro", departmentId: governanca.id },
    { name: "Fernanda Lima", position: "Garçonete", departmentId: alimentos.id },
    { name: "Carlos Souza", position: "Técnico de Manutenção", departmentId: manutencao.id },
    { name: "Beatriz Santos", position: "Analista de RH", departmentId: rh.id },
    { name: "Rafael Oliveira", position: "Assistente Financeiro", departmentId: financeiro.id },
    { name: "Juliana Alves", position: "Supervisora de Recepção", departmentId: recepcao.id },
    { name: "Pedro Rocha", position: "Cozinheiro", departmentId: alimentos.id },
  ];

  const employees = [];
  for (const [i, data] of employeesData.entries()) {
    const emailLocal = data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/\s+/g, ".");
    const employee = await db.user.create({
      data: {
        name: data.name,
        email: `${emailLocal}@trihoteis.com.br`,
        passwordHash: employeePassword,
        role: "EMPLOYEE",
        position: data.position,
        departmentId: data.departmentId,
        lastLoginAt: i < 5 ? new Date(Date.now() - i * 1000 * 60 * 60 * 24) : null,
      },
    });
    employees.push(employee);
  }

  const inactiveEmployee = await db.user.create({
    data: {
      name: "Roberto Dias",
      email: "roberto.dias@trihoteis.com.br",
      passwordHash: employeePassword,
      role: "EMPLOYEE",
      position: "Ex-colaborador — Manutenção",
      departmentId: manutencao.id,
      active: false,
    },
  });

  console.log("Preparando arquivos de demonstração (vídeo e PDFs)...");
  const videoIntro = await createVideoAsset(admin.id, "Apresentação - Segurança no Trabalho.mp4");
  const videoProcedimentos = await createVideoAsset(admin.id, "Procedimentos de Segurança.mp4");
  const videoAtendimento = await createVideoAsset(admin.id, "Padrão de Atendimento Tri Hotéis.mp4");

  const pdfManual = await createPdfAsset(admin.id, "Manual de Segurança no Trabalho", [
    "Este manual apresenta as diretrizes gerais de segurança no trabalho",
    "aplicáveis a todos os colaboradores da rede Tri Hotéis.",
    "",
    "1. Utilize sempre os equipamentos de proteção individual (EPIs).",
    "2. Reporte imediatamente qualquer situação de risco à liderança.",
    "3. Conheça as rotas de fuga e pontos de encontro do seu setor.",
    "4. Mantenha áreas de circulação sempre desobstruídas.",
    "5. Participe de todos os treinamentos obrigatórios de segurança.",
  ]);

  const pdfComplementar = await createPdfAsset(admin.id, "Material Complementar - Procedimentos", [
    "Material de apoio com os procedimentos operacionais padrão (POPs)",
    "para situações de emergência e uso correto de equipamentos.",
    "",
    "Consulte também os murais informativos disponíveis em cada unidade",
    "e procure seu supervisor em caso de dúvidas.",
  ]);

  const pdfCompliance = await createPdfAsset(admin.id, "Código de Conduta Tri Hotéis", [
    "O Código de Conduta estabelece os princípios éticos que orientam",
    "a atuação de todos os colaboradores da rede Tri Hotéis.",
    "",
    "Trate hóspedes e colegas com respeito e cordialidade.",
    "Zele pela confidencialidade das informações da empresa e dos hóspedes.",
    "Reporte situações de assédio ou conflito de interesse ao canal de ética.",
  ]);

  console.log("Criando cursos...");

  const cursoSeguranca = await db.course.create({
    data: {
      title: "Segurança no Trabalho",
      description:
        "Treinamento obrigatório sobre normas e procedimentos de segurança do trabalho para todos os colaboradores da Tri Hotéis.",
      categoryId: catSeguranca.id,
      instructor: "Ana Beatriz Ferreira",
      durationMinutes: 90,
      difficulty: "INICIANTE",
      status: "PUBLISHED",
      sequential: true,
      allowDownload: true,
      certificateEnabled: true,
      videoCompletionThreshold: 90,
      createdById: admin.id,
      modules: {
        create: [
          {
            title: "Módulo 1 — Introdução",
            order: 0,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Apresentação em vídeo",
                  order: 0,
                  type: "VIDEO",
                  required: true,
                  videoSource: "UPLOAD",
                  videoFileId: videoIntro.id,
                  videoDurationSeconds: 10,
                },
                {
                  title: "Aula 2 — Manual em PDF",
                  order: 1,
                  type: "PDF",
                  required: true,
                  pdfFileId: pdfManual.id,
                },
              ],
            },
          },
          {
            title: "Módulo 2 — Procedimentos",
            order: 1,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Videoaula",
                  order: 0,
                  type: "VIDEO",
                  required: true,
                  videoSource: "UPLOAD",
                  videoFileId: videoProcedimentos.id,
                  videoDurationSeconds: 10,
                },
                {
                  title: "Aula 2 — Material complementar",
                  order: 1,
                  type: "PDF",
                  required: true,
                  pdfFileId: pdfComplementar.id,
                },
              ],
            },
          },
          {
            title: "Módulo 3 — Encerramento",
            order: 2,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Revisão",
                  order: 0,
                  type: "TEXT",
                  required: true,
                  textContent:
                    "Revise os principais pontos abordados: uso de EPIs, rotas de fuga, comunicação de riscos e procedimentos de emergência. Releia o manual sempre que tiver dúvidas.",
                },
                {
                  title: "Aula 2 — Conclusão",
                  order: 1,
                  type: "TEXT",
                  required: true,
                  textContent:
                    "Parabéns por concluir o treinamento de Segurança no Trabalho! Lembre-se: a segurança é responsabilidade de todos, todos os dias.",
                },
              ],
            },
          },
        ],
      },
    },
    include: { modules: { include: { lessons: true } } },
  });

  const cursoAtendimento = await db.course.create({
    data: {
      title: "Atendimento de Excelência ao Hóspede",
      description:
        "Aprenda os padrões de atendimento que fazem da experiência Tri Hotéis uma referência em hospitalidade.",
      categoryId: catAtendimento.id,
      instructor: "Ana Beatriz Ferreira",
      durationMinutes: 60,
      difficulty: "INTERMEDIARIO",
      status: "PUBLISHED",
      sequential: false,
      allowDownload: true,
      certificateEnabled: true,
      videoCompletionThreshold: 90,
      createdById: admin.id,
      modules: {
        create: [
          {
            title: "Módulo 1 — Fundamentos da Hospitalidade",
            order: 0,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Padrão de atendimento Tri Hotéis",
                  order: 0,
                  type: "VIDEO",
                  required: true,
                  videoSource: "UPLOAD",
                  videoFileId: videoAtendimento.id,
                  videoDurationSeconds: 10,
                },
                {
                  title: "Aula 2 — Comunicação e cordialidade",
                  order: 1,
                  type: "TEXT",
                  required: true,
                  textContent:
                    "A comunicação clara, o sorriso no atendimento e a escuta ativa são a base de uma experiência memorável para o hóspede.",
                },
              ],
            },
          },
          {
            title: "Módulo 2 — Situações do dia a dia",
            order: 1,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Lidando com reclamações",
                  order: 0,
                  type: "TEXT",
                  required: true,
                  textContent:
                    "Ouça o hóspede sem interromper, demonstre empatia, resolva o quanto antes e registre a ocorrência para melhoria contínua.",
                },
                {
                  title: "Aula 2 — Vídeo bônus (link externo)",
                  order: 1,
                  type: "VIDEO",
                  required: false,
                  videoSource: "EMBED",
                  videoEmbedUrl: "https://www.youtube.com/embed/aqz-KE-bpKQ",
                  videoDurationSeconds: 60,
                },
              ],
            },
          },
        ],
      },
    },
    include: { modules: { include: { lessons: true } } },
  });

  const cursoCompliance = await db.course.create({
    data: {
      title: "Compliance e Código de Conduta",
      description:
        "Conheça os princípios éticos e as políticas de compliance que todo colaborador da Tri Hotéis deve seguir.",
      categoryId: catCompliance.id,
      instructor: "Ana Beatriz Ferreira",
      durationMinutes: 45,
      difficulty: "AVANCADO",
      status: "PUBLISHED",
      sequential: true,
      allowDownload: false,
      certificateEnabled: true,
      videoCompletionThreshold: 90,
      createdById: admin.id,
      modules: {
        create: [
          {
            title: "Módulo Único — Código de Conduta",
            order: 0,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Código de Conduta (PDF)",
                  order: 0,
                  type: "PDF",
                  required: true,
                  pdfFileId: pdfCompliance.id,
                },
                {
                  title: "Aula 2 — Canal de ética",
                  order: 1,
                  type: "TEXT",
                  required: true,
                  textContent:
                    "Situações de assédio, conflito de interesse ou fraude devem ser reportadas ao canal de ética, com total confidencialidade e sem retaliação.",
                },
              ],
            },
          },
        ],
      },
    },
    include: { modules: { include: { lessons: true } } },
  });

  // Curso em rascunho — demonstra o fluxo de publicação
  await db.course.create({
    data: {
      title: "Liderança para Supervisores",
      description:
        "Trilha de desenvolvimento de liderança para supervisores e futuros gestores da Tri Hotéis.",
      categoryId: catLideranca.id,
      instructor: "Ana Beatriz Ferreira",
      durationMinutes: 120,
      difficulty: "AVANCADO",
      status: "DRAFT",
      sequential: false,
      allowDownload: true,
      certificateEnabled: true,
      createdById: admin.id,
      modules: {
        create: [
          {
            title: "Módulo 1 — Introdução à Liderança",
            order: 0,
            lessons: {
              create: [
                {
                  title: "Aula 1 — O papel do líder",
                  order: 0,
                  type: "TEXT",
                  required: true,
                  textContent: "Conteúdo em elaboração.",
                },
              ],
            },
          },
        ],
      },
    },
  });

  await db.course.create({
    data: {
      title: "Higiene e Segurança Alimentar",
      description:
        "Boas práticas de manipulação de alimentos e normas sanitárias para as equipes de Alimentos e Bebidas.",
      categoryId: catOperacoes.id,
      instructor: "Ana Beatriz Ferreira",
      durationMinutes: 50,
      difficulty: "INICIANTE",
      status: "PUBLISHED",
      sequential: false,
      allowDownload: true,
      certificateEnabled: true,
      createdById: admin.id,
      modules: {
        create: [
          {
            title: "Módulo 1 — Boas Práticas",
            order: 0,
            lessons: {
              create: [
                {
                  title: "Aula 1 — Higienização e manipulação",
                  order: 0,
                  type: "TEXT",
                  required: true,
                  textContent:
                    "Lave sempre as mãos antes de manipular alimentos, utilize utensílios apropriados e respeite a cadeia de temperatura.",
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log("Matriculando funcionários e simulando progresso...");

  const [marina, joao, fernanda, carlos, beatriz, rafael, juliana] = employees;

  // Marina: em andamento no curso de Segurança (50%), concluiu Atendimento (100%)
  await db.enrollment.create({
    data: {
      userId: marina.id,
      courseId: cursoSeguranca.id,
      mandatory: true,
      dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      assignedById: admin.id,
    },
  });
  const segurancaLessons = cursoSeguranca.modules.flatMap((m) => m.lessons);
  for (const lesson of segurancaLessons.slice(0, 3)) {
    await db.lessonProgress.create({
      data: { userId: marina.id, lessonId: lesson.id, completed: true, completedAt: new Date() },
    });
  }
  await recalcCourseProgress(marina.id, cursoSeguranca.id);

  await db.enrollment.create({
    data: {
      userId: marina.id,
      courseId: cursoAtendimento.id,
      mandatory: false,
      assignedById: admin.id,
    },
  });
  const atendimentoLessons = cursoAtendimento.modules.flatMap((m) => m.lessons);
  for (const lesson of atendimentoLessons.filter((l) => l.required)) {
    await db.lessonProgress.create({
      data: { userId: marina.id, lessonId: lesson.id, completed: true, completedAt: new Date() },
    });
  }
  await recalcCourseProgress(marina.id, cursoAtendimento.id);

  // João: matriculado em Segurança, atrasado, sem progresso
  await db.enrollment.create({
    data: {
      userId: joao.id,
      courseId: cursoSeguranca.id,
      mandatory: true,
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      assignedById: admin.id,
    },
  });
  await recalcCourseProgress(joao.id, cursoSeguranca.id);

  // Fernanda: em andamento em Atendimento (uma aula concluída)
  await db.enrollment.create({
    data: { userId: fernanda.id, courseId: cursoAtendimento.id, mandatory: true, assignedById: admin.id },
  });
  await db.lessonProgress.create({
    data: {
      userId: fernanda.id,
      lessonId: atendimentoLessons[0].id,
      completed: true,
      completedAt: new Date(),
    },
  });
  await recalcCourseProgress(fernanda.id, cursoAtendimento.id);

  // Carlos: matriculado em Segurança (não iniciado) e Compliance (em andamento)
  await db.enrollment.create({
    data: {
      userId: carlos.id,
      courseId: cursoSeguranca.id,
      mandatory: true,
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      assignedById: admin.id,
    },
  });
  await recalcCourseProgress(carlos.id, cursoSeguranca.id);

  await db.enrollment.create({
    data: { userId: carlos.id, courseId: cursoCompliance.id, mandatory: true, assignedById: admin.id },
  });
  const complianceLessons = cursoCompliance.modules.flatMap((m) => m.lessons);
  await db.lessonProgress.create({
    data: {
      userId: carlos.id,
      lessonId: complianceLessons[0].id,
      completed: true,
      completedAt: new Date(),
    },
  });
  await recalcCourseProgress(carlos.id, cursoCompliance.id);

  // Beatriz: concluiu todos os 3 cursos publicados (para exemplificar certificados)
  for (const course of [cursoSeguranca, cursoAtendimento, cursoCompliance]) {
    await db.enrollment.create({
      data: { userId: beatriz.id, courseId: course.id, mandatory: true, assignedById: admin.id },
    });
    const lessons = course.modules.flatMap((m) => m.lessons).filter((l) => l.required);
    for (const lesson of lessons) {
      await db.lessonProgress.create({
        data: { userId: beatriz.id, lessonId: lesson.id, completed: true, completedAt: new Date() },
      });
    }
    await recalcCourseProgress(beatriz.id, course.id);
  }

  // Rafael: matriculado em Compliance, atrasado (sem prazo definido -> não atrasado), 0%
  await db.enrollment.create({
    data: { userId: rafael.id, courseId: cursoCompliance.id, mandatory: false, assignedById: admin.id },
  });
  await recalcCourseProgress(rafael.id, cursoCompliance.id);

  // Juliana: em andamento em Segurança (1 aula)
  await db.enrollment.create({
    data: {
      userId: juliana.id,
      courseId: cursoSeguranca.id,
      mandatory: true,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      assignedById: admin.id,
    },
  });
  await db.lessonProgress.create({
    data: {
      userId: juliana.id,
      lessonId: segurancaLessons[0].id,
      completed: true,
      completedAt: new Date(),
    },
  });
  await recalcCourseProgress(juliana.id, cursoSeguranca.id);

  // Pedro: sem nenhuma matrícula (para mostrar estado vazio no portal)

  console.log("Registrando histórico de acessos e atividades administrativas...");

  await db.accessLog.createMany({
    data: [marina, joao, fernanda, carlos, beatriz, rafael, juliana].map((u) => ({
      userId: u.id,
      action: "LOGIN",
      createdAt: new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000),
    })),
  });

  await db.adminActivityLog.createMany({
    data: [
      {
        adminId: admin.id,
        action: "CRIAR_CURSO",
        targetType: "Course",
        targetId: cursoSeguranca.id,
        details: cursoSeguranca.title,
      },
      {
        adminId: admin.id,
        action: "CRIAR_CURSO",
        targetType: "Course",
        targetId: cursoAtendimento.id,
        details: cursoAtendimento.title,
      },
      {
        adminId: admin.id,
        action: "CURSO_PUBLISHED",
        targetType: "Course",
        targetId: cursoSeguranca.id,
      },
      {
        adminId: admin.id,
        action: "MATRICULAR",
        targetType: "Course",
        targetId: cursoSeguranca.id,
        details: "7 funcionário(s) matriculado(s)",
      },
      {
        adminId: admin.id,
        action: "DESATIVAR_FUNCIONARIO",
        targetType: "User",
        targetId: inactiveEmployee.id,
      },
    ],
  });

  console.log("\nSeed concluído com sucesso!\n");
  console.log("Login administrativo: admin@trihoteis.com.br / Admin@123");
  console.log("Login de funcionário (qualquer um): <nome.sobrenome>@trihoteis.com.br / Colaborador@123");
  console.log("Exemplo: marina.costa@trihoteis.com.br / Colaborador@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
