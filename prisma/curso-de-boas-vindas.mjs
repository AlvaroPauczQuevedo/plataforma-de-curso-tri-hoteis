/**
 * Cria o curso "Como usar a Academia Corporativa" e a prova final dele.
 *
 * É o curso que explica a própria plataforma: como entrar, como as aulas
 * funcionam, o que é treinamento obrigatório, como a prova corrige e para que
 * serve o certificado. Serve de primeiro curso para quem acabou de receber a
 * senha — e, de quebra, faz a pessoa passar por todos os mecanismos ao menos
 * uma vez antes de precisar deles a sério.
 *
 * Roda por linha de comando, e não por uma tela: montar oito aulas e oito
 * questões pelo formulário é meia hora de digitação, e o conteúdo precisa
 * poder ser corrigido e recriado sem esse custo.
 *
 * O texto das aulas é PLANO. A tela do aluno renderiza `textContent` com
 * `whitespace-pre-line` e nada mais — asterisco de negrito e cerquilha de
 * título apareceriam crus para o funcionário.
 *
 * Uso:
 *   npx tsx prisma/curso-de-boas-vindas.ts --simular
 *   npx tsx prisma/curso-de-boas-vindas.ts
 *   npx tsx prisma/curso-de-boas-vindas.ts --autor maria.silva --matricular-todos
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TITULO_CURSO = "Como usar a Academia Corporativa";
const TITULO_PROVA = "Prova final — Como usar a Academia Corporativa";

const simular = process.argv.includes("--simular");
const matricularTodos = process.argv.includes("--matricular-todos");
const autorPedido = (() => {
  const i = process.argv.indexOf("--autor");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

/* --------------------------------------------------------------- conteúdo */

const MODULOS = [
  {
    titulo: "Comece por aqui",
    aulas: [
      {
        titulo: "Bem-vindo à Academia Corporativa",
        texto: `A Academia Corporativa é onde ficam os treinamentos da rede Tri Hotéis.

Aqui você encontra os cursos que a empresa preparou para a sua função, faz as provas quando houver, e recebe o certificado de tudo que concluir.

Tudo funciona pelo navegador — no computador do hotel ou no seu celular. Não precisa instalar nada.

Este primeiro curso é sobre a própria plataforma. Ele leva uns vinte minutos e existe para que, quando chegar um treinamento importante, você já saiba onde clicar.

Uma coisa que vale saber desde já: o seu progresso fica guardado. Se você parar no meio de uma aula e voltar amanhã, continua de onde estava.`,
      },
      {
        titulo: "Seu acesso: usuário e senha",
        texto: `Você entra na plataforma com um NOME DE USUÁRIO, e não com e-mail.

Ele costuma ser o seu primeiro nome e o seu sobrenome, separados por ponto. Por exemplo: maria.silva

O nome de usuário é sempre escrito em letras minúsculas, sem acento e sem espaço. Se o teclado do seu celular colocar maiúscula na primeira letra, não tem problema: a plataforma entende do mesmo jeito.

A SENHA PROVISÓRIA

A primeira senha foi entregue a você em papel, pelo RH. Ela serve uma vez só: assim que você entrar, a plataforma vai pedir que você crie uma senha nova, sua, que ninguém mais conhece.

Escolha uma senha de pelo menos 6 caracteres e não a compartilhe com colegas. O seu histórico de treinamento é o seu — quem entrar com o seu usuário faz curso e prova no seu nome.

SE VOCÊ ESQUECER A SENHA

Procure o RH. Eles geram uma senha nova para você na hora.

Se errar a senha cinco vezes seguidas, o acesso trava por alguns minutos. É proteção contra quem tenta adivinhar senha dos outros. Espere um pouco e tente de novo, ou peça uma senha nova ao RH.`,
      },
    ],
  },
  {
    titulo: "Cursos e aulas",
    aulas: [
      {
        titulo: "Onde ficam os seus cursos",
        texto: `Ao entrar, a primeira tela mostra um resumo: o que você está fazendo, o que falta e o que já concluiu.

No menu você encontra:

MEUS CURSOS — tudo em que você está matriculado, com a barra de progresso de cada um.

HISTÓRICO — o que você já concluiu.

CERTIFICADOS — os certificados que você já ganhou, prontos para baixar.

PERFIL — seus dados e o lugar onde você troca a sua senha.

Você não precisa se matricular em nada por conta própria. Os cursos aparecem sozinhos na sua lista: alguns porque a empresa atribuiu a você, outros porque são obrigatórios para o seu setor.

Clicando num curso, você vê os módulos e as aulas. Alguns cursos liberam as aulas na ordem — a seguinte só abre depois que a anterior for concluída. Quando for assim, a plataforma avisa.`,
      },
      {
        titulo: "Os tipos de aula",
        texto: `Uma aula pode ser de três tipos, e cada um conclui de um jeito.

AULA EM TEXTO
Você lê o conteúdo e clica no botão de marcar como concluída. É este tipo de aula que você está lendo agora.

AULA EM PDF
Um documento para ler ou baixar. Também tem o botão de concluir.

AULA EM VÍDEO
Esta é a que mais gera dúvida, então preste atenção:

O vídeo precisa ser ASSISTIDO. A plataforma acompanha quanto você viu de verdade, e a aula só é dada como concluída quando você chega perto do fim do vídeo assistindo mesmo.

Arrastar a bolinha da barra até o fim NÃO conclui a aula. Deixar o vídeo aberto numa aba parada também não. Isso não é implicância: um treinamento que se conclui sem assistir não prova nada, e o certificado que sai dele não vale nada numa auditoria.

Se você fechar no meio, não perde nada. Ao voltar, o vídeo continua de onde parou e o tempo que você já assistiu continua contado.

Pode assistir em velocidade um pouco maior, se preferir — dentro do razoável, isso é aceito.`,
      },
      {
        titulo: "Prazos e treinamentos obrigatórios",
        texto: `Alguns cursos são OBRIGATÓRIOS. Eles são atribuídos a você pela empresa, normalmente por causa do seu setor, e costumam ter PRAZO.

O prazo aparece junto do curso, na sua lista. Enquanto ele não chega, o curso fica como pendente. Depois que passa, ele fica marcado como atrasado — e aparece assim também para o RH e para a sua liderança.

Curso obrigatório atrasado não é só um número numa tela: treinamentos como segurança e boas práticas são cobrados em auditoria, e a empresa precisa comprovar que a equipe fez.

Se você entrar de férias ou afastar por algum motivo e o prazo passar, converse com o RH.

Há também cursos SEM prazo e cursos opcionais. Esses você faz quando puder — eles não entram na contagem de pendências.

Uma dica: comece pelos que têm prazo mais próximo. A lista já mostra essa informação para você não precisar adivinhar.`,
      },
    ],
  },
  {
    titulo: "Provas e certificado",
    aulas: [
      {
        titulo: "Como funcionam as provas",
        texto: `Alguns cursos terminam com uma prova. Ela aparece como uma aula, no fim do curso, e também na área de Provas.

COMO É
Questões de múltipla escolha. Você marca uma alternativa em cada uma e envia. A correção sai na hora.

NOTA MÍNIMA
Cada prova tem uma nota mínima para aprovação, informada antes de você começar. Nesta aqui, por exemplo, são 70 por cento de acerto.

SE VOCÊ FOR REPROVADO
Você pode refazer a prova. Não há limite de tentativas e não há castigo por errar: a ideia é que você aprenda o conteúdo, não que acerte de primeira.

Ao ver o resultado, a plataforma mostra QUAIS questões você errou — mas não mostra a resposta certa de quem foi reprovado. Isso é de propósito: se o gabarito aparecesse, bastaria refazer copiando, e a prova deixaria de significar alguma coisa. Volte às aulas, releia o ponto e tente de novo.

Quem é aprovado vê o gabarito completo, para conferir o que errou.

E uma tranquilidade: se você já passou uma vez e resolver refazer por curiosidade, uma nota pior depois NÃO apaga a sua aprovação. Quem passou, passou.`,
      },
      {
        titulo: "Seu certificado",
        texto: `Ao concluir todas as aulas obrigatórias de um curso — inclusive a prova, quando houver — o certificado é emitido automaticamente.

Ele aparece em CERTIFICADOS, no menu, e você pode baixar em PDF quando quiser, quantas vezes quiser.

O certificado traz o seu nome, o nome do curso, a data e um código de conferência.

O QR CODE

No canto do certificado há um QR Code. Ele serve para QUALQUER PESSOA conferir se aquele certificado é verdadeiro — o RH, um auditor, ou um empregador futuro.

Quem aponta a câmera do celular para o código chega numa página pública que confirma o nome, o curso e a data. Não precisa ter login na plataforma.

É por isso que o certificado tem valor: não é um papel bonito que qualquer um imprime, é um documento que pode ser conferido na fonte. E é por isso também que a regra do vídeo assistido existe — o que está atrás do certificado precisa ser verdade.

Você chegou ao fim das aulas. Agora é a prova final: dez minutos, e o seu primeiro certificado.`,
      },
    ],
  },
];

/* ------------------------------------------------------------------ prova */

const QUESTOES = [
  {
    enunciado: "Com o que você entra na Academia Corporativa?",
    alternativas: [
      "Com o seu e-mail pessoal",
      "Com o seu nome de usuário",
      "Com o seu CPF",
      "Com o número do crachá",
    ],
    correta: 1,
  },
  {
    enunciado:
      "Você esqueceu a sua senha e nunca cadastrou um e-mail. Qual é o caminho certo?",
    alternativas: [
      "Criar uma conta nova para você",
      "Esperar 24 horas, que o sistema libera sozinho",
      "Pedir a senha emprestada de um colega",
      "Procurar o RH, que gera uma senha nova",
    ],
    correta: 3,
  },
  {
    enunciado: "O que acontece quando você entra pela primeira vez com a senha provisória?",
    alternativas: [
      "A plataforma pede que você crie uma senha nova",
      "Nada: aquela senha vale para sempre",
      "Você precisa cadastrar um e-mail antes de continuar",
      "O acesso expira em uma hora",
    ],
    correta: 0,
  },
  {
    enunciado: "Numa aula em vídeo, o que faz a aula ser dada como concluída?",
    alternativas: [
      "Arrastar a barra do vídeo até o fim",
      "Abrir a aula e deixar a página aberta numa aba",
      "Assistir ao vídeo de verdade até perto do fim",
      "Clicar em concluir a qualquer momento",
    ],
    correta: 2,
  },
  {
    enunciado: "O que é um treinamento obrigatório?",
    alternativas: [
      "Um curso que você escolhe fazer por interesse",
      "Um curso atribuído a você pela empresa, normalmente com prazo",
      "Um curso que só a liderança consegue ver",
      "Um curso que não emite certificado",
    ],
    correta: 1,
  },
  {
    enunciado: "Você fez a prova de um curso e foi reprovado. O que acontece?",
    alternativas: [
      "Você perde o acesso ao curso",
      "Você precisa esperar 30 dias para tentar de novo",
      "Todo o seu progresso no curso é apagado",
      "Você pode refazer a prova, sem limite de tentativas",
    ],
    correta: 3,
  },
  {
    enunciado: "Depois de uma prova em que você foi reprovado, o que a tela mostra?",
    alternativas: [
      "Quais questões você errou, mas não a resposta certa",
      "O gabarito completo, com todas as respostas",
      "Apenas a nota, sem nenhum detalhe",
      "As respostas que os seus colegas marcaram",
    ],
    correta: 0,
  },
  {
    enunciado: "Para que serve o QR Code impresso no certificado?",
    alternativas: [
      "Para você baixar o certificado outra vez",
      "Para registrar a sua presença no treinamento",
      "Para qualquer pessoa conferir se o certificado é verdadeiro",
      "Para abrir o curso de onde ele veio",
    ],
    correta: 2,
  },
];

const NOTA_MINIMA = 70;

/* ------------------------------------------------------------------ criação */

async function main() {
  // Confere o gabarito ANTES de tocar no banco: uma questão sem resposta certa
  // é aceita pelo schema e só apareceria como prova impossível de passar.
  for (const [i, q] of QUESTOES.entries()) {
    if (q.correta < 0 || q.correta >= q.alternativas.length) {
      throw new Error(`Questão ${i + 1} aponta para uma alternativa que não existe.`);
    }
    if (new Set(q.alternativas).size !== q.alternativas.length) {
      throw new Error(`Questão ${i + 1} tem alternativas repetidas.`);
    }
  }

  const autor = autorPedido
    ? await db.user.findUnique({ where: { username: autorPedido } })
    : ((await db.user.findFirst({ where: { role: "ADMIN", protegido: true } })) ??
      (await db.user.findFirst({ where: { role: "ADMIN" } })));

  if (!autor) {
    throw new Error(
      autorPedido
        ? `Nenhuma conta com o usuário "${autorPedido}".`
        : "Nenhuma conta de administrador encontrada para constar como autora."
    );
  }
  if (autor.role !== "ADMIN") {
    throw new Error(`${autor.username} não é administrador e não pode constar como autor.`);
  }

  const jaExiste = await db.course.findFirst({ where: { title: TITULO_CURSO } });

  const totalAulas = MODULOS.reduce((n, m) => n + m.aulas.length, 0);

  console.log("");
  console.log(`Curso : ${TITULO_CURSO}`);
  console.log(`Autor : ${autor.name} (${autor.username})`);
  console.log(`Módulos: ${MODULOS.length}   Aulas: ${totalAulas} + 1 de prova`);
  console.log(`Prova : ${QUESTOES.length} questões, nota mínima ${NOTA_MINIMA}%`);
  console.log("");

  if (jaExiste) {
    console.error(`Já existe um curso chamado "${TITULO_CURSO}".`);
    console.error("Apague-o pelo painel antes de recriar, para não duplicar o conteúdo");
    console.error("nem o progresso de quem já o fez.");
    return;
  }

  if (simular) {
    for (const m of MODULOS) {
      console.log(`  ${m.titulo}`);
      for (const a of m.aulas) console.log(`     - ${a.titulo}`);
    }
    console.log(`  Provas`);
    console.log(`     - ${TITULO_PROVA}`);
    console.log("");
    console.log("Simulação: nada foi gravado. Rode sem --simular para criar.");
    return;
  }

  const prova = await db.prova.create({
    data: {
      titulo: TITULO_PROVA,
      descricao:
        "Confere o que foi visto no curso: acesso, aulas, prazos, provas e certificado.",
      notaMinima: NOTA_MINIMA,
      publicada: true,
      // Sem departamento: prova geral, que qualquer funcionário alcança.
      createdById: autor.id,
      questoes: {
        create: QUESTOES.map((q, ordem) => ({
          enunciado: q.enunciado,
          ordem,
          alternativas: {
            create: q.alternativas.map((texto, i) => ({
              texto,
              correta: i === q.correta,
              ordem: i,
            })),
          },
        })),
      },
    },
  });

  const curso = await db.course.create({
    data: {
      title: TITULO_CURSO,
      description:
        "Como entrar, onde ficam os seus cursos, como as aulas são concluídas, o que são treinamentos obrigatórios, como funcionam as provas e para que serve o certificado. Comece por aqui.",
      instructor: "Recursos Humanos — Tri Hotéis",
      difficulty: "INICIANTE",
      status: "PUBLISHED",
      durationMinutes: 25,
      // Em ordem: o curso ensina que existem cursos sequenciais, e mostra isso
      // sendo um. As aulas se abrem conforme a anterior é concluída.
      sequential: true,
      certificateEnabled: true,
      createdById: autor.id,
      modules: {
        create: MODULOS.map((modulo, ordemModulo) => ({
          title: modulo.titulo,
          order: ordemModulo,
          lessons: {
            create: modulo.aulas.map((aula, ordemAula) => ({
              title: aula.titulo,
              order: ordemAula,
              type: "TEXT",
              required: true,
              textContent: aula.texto,
            })),
          },
        })),
      },
    },
    include: { modules: { orderBy: { order: "asc" } } },
  });

  // A prova entra como última aula do último módulo.
  const ultimoModulo = curso.modules[curso.modules.length - 1];
  const aulasDoUltimo = MODULOS[MODULOS.length - 1].aulas.length;

  await db.lesson.create({
    data: {
      moduleId: ultimoModulo.id,
      title: "Prova final",
      order: aulasDoUltimo,
      type: "PROVA",
      required: true,
      provaId: prova.id,
    },
  });

  console.log(`Curso criado: ${curso.id}`);
  console.log(`Prova criada: ${prova.id}`);

  if (matricularTodos) {
    const funcionarios = await db.user.findMany({
      where: { role: "EMPLOYEE", active: true },
      select: { id: true },
    });

    let criadas = 0;
    for (const f of funcionarios) {
      const ja = await db.enrollment.findFirst({
        where: { userId: f.id, courseId: curso.id },
      });
      if (ja) continue;
      await db.enrollment.create({ data: { userId: f.id, courseId: curso.id } });
      criadas += 1;
    }
    console.log(`Matriculados: ${criadas} funcionário(s) ativo(s).`);
  } else {
    console.log("");
    console.log("Ninguém foi matriculado. Para matricular todo mundo:");
    console.log("  npx tsx prisma/curso-de-boas-vindas.ts --matricular-todos");
    console.log("Ou use a tela Matrículas, escolhendo quem deve fazer.");
  }

  console.log("");
}

main()
  .catch((erro) => {
    console.error("");
    console.error(`Falhou: ${erro.message}`);
    console.error("");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
