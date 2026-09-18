/**
 * Tudo que a plataforma guarda sobre UMA pessoa, reunido num lugar.
 *
 * Atende dois direitos do titular, do Art. 18 da LGPD:
 *
 *  - **II, acesso aos dados** — a tela `/meus-dados` mostra o conteúdo;
 *  - **V, portabilidade** — a exportação devolve o mesmo conteúdo em JSON,
 *    que é o "formato interoperável e de uso comum" que o inciso pede.
 *
 * Os dois saem da MESMA função de propósito. Se a tela e a exportação
 * buscassem cada uma a sua parte, a divergência apareceria do pior jeito
 * possível para este assunto: a pessoa exportaria os dados e receberia menos
 * do que a tela mostrou, ou — pior — mais do que ela sabia que existia.
 *
 * ---
 *
 * **O que NÃO entra, e por quê.**
 *
 * - `passwordHash`: não é dado sobre a pessoa, é credencial. Entregá-lo seria
 *   dar a quem interceptasse a exportação o material para um ataque offline.
 * - Dados de terceiros: o nome de quem aplicou um treinamento presencial entra
 *   porque consta do registro dela, mas nada que seja de outra pessoa.
 * - `segredo` de sessão de presença, tokens, e o que for de operação interna.
 *
 * O resto entra inteiro. A ideia do Art. 18 é que não haja surpresa: se a
 * plataforma guarda, a pessoa pode ver.
 */
import { db } from "@/lib/db";

export type MeusDados = {
  geradoEm: Date;
  identificacao: {
    nome: string;
    usuario: string;
    email: string | null;
    telefone: string | null;
    cargo: string | null;
    departamento: string | null;
    hotel: string | null;
    matricula: string | null;
  };
  conta: {
    perfil: string;
    ativa: boolean;
    criadaEm: Date;
    ultimoAcesso: Date | null;
    precisaTrocarSenha: boolean;
  };
  treinamentos: {
    curso: string;
    obrigatorio: boolean;
    prazo: Date | null;
    matriculadoEm: Date;
    progressoPercent: number;
    concluidoEm: Date | null;
  }[];
  certificados: { curso: string; codigo: string; emitidoEm: Date }[];
  treinamentosPresenciais: {
    curso: string;
    concluidoEm: Date;
    instrutor: string | null;
    observacao: string | null;
  }[];
  documentosAceitos: {
    documento: string;
    versaoAceita: number;
    aceitoEm: Date;
    origem: string | null;
  }[];
  presencas: { treinamento: string; registradaEm: Date; origem: string | null }[];
  provas: {
    prova: string;
    realizadaEm: Date;
    nota: number;
    acertos: string;
    aprovado: boolean;
  }[];
  registrosDeAcesso: { acao: string; quando: Date }[];
};

/**
 * Reúne os dados de uma pessoa.
 *
 * Recebe o `userId` de quem está pedindo, e é o chamador que garante ser a
 * própria pessoa — a tela usa `requireUser()`, então o id vem da sessão e não
 * da URL. Aceitar id por parâmetro da requisição transformaria esta função na
 * maneira mais fácil de ler a ficha de qualquer colega.
 */
export async function reunirMeusDados(userId: string): Promise<MeusDados | null> {
  const pessoa = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      username: true,
      email: true,
      telefone: true,
      position: true,
      matricula: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
      mustChangePassword: true,
      department: { select: { name: true } },
      unidade: { select: { name: true } },
    },
  });
  if (!pessoa) return null;

  const [matriculas, progressos, certificados, externas, aceites, presencas, tentativas, acessos] =
    await Promise.all([
      db.enrollment.findMany({
        where: { userId },
        select: {
          courseId: true,
          mandatory: true,
          dueDate: true,
          assignedAt: true,
          course: { select: { title: true } },
        },
        orderBy: { assignedAt: "desc" },
      }),
      db.courseProgress.findMany({
        where: { userId },
        select: { courseId: true, percent: true, completedAt: true },
      }),
      db.certificate.findMany({
        where: { userId },
        select: { code: true, issuedAt: true, course: { select: { title: true } } },
        orderBy: { issuedAt: "desc" },
      }),
      db.conclusaoExterna.findMany({
        where: { userId },
        select: {
          concluidoEm: true,
          instrutor: true,
          observacao: true,
          course: { select: { title: true } },
        },
        orderBy: { concluidoEm: "desc" },
      }),
      db.aceiteDeDocumento.findMany({
        where: { userId },
        select: {
          versao: true,
          aceitoEm: true,
          ip: true,
          documento: { select: { titulo: true } },
        },
        orderBy: { aceitoEm: "desc" },
      }),
      db.presencaEmSessao.findMany({
        where: { userId },
        select: {
          registradaEm: true,
          ip: true,
          sessao: { select: { course: { select: { title: true } } } },
        },
        orderBy: { registradaEm: "desc" },
      }),
      db.tentativaProva.findMany({
        where: { userId },
        select: {
          createdAt: true,
          nota: true,
          acertos: true,
          total: true,
          aprovado: true,
          prova: { select: { titulo: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      /*
        Os registros de acesso entram porque são dado pessoal sobre ela — é o
        histórico de quando entrou. Vêm limitados aos mais recentes: a
        finalidade aqui é a pessoa ver o próprio padrão de uso e estranhar um
        acesso que não reconhece, e para isso os últimos bastam. A retenção
        (ver `lib/retencao`) já os apaga com o tempo.
      */
      db.accessLog.findMany({
        where: { userId },
        select: { action: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

  const percentPor = new Map(progressos.map((p) => [p.courseId, p]));

  return {
    geradoEm: new Date(),
    identificacao: {
      nome: pessoa.name,
      usuario: pessoa.username,
      email: pessoa.email,
      telefone: pessoa.telefone,
      cargo: pessoa.position,
      departamento: pessoa.department?.name ?? null,
      hotel: pessoa.unidade?.name ?? null,
      matricula: pessoa.matricula,
    },
    conta: {
      perfil: pessoa.role === "ADMIN" ? "Administrador" : "Funcionário",
      ativa: pessoa.active,
      criadaEm: pessoa.createdAt,
      ultimoAcesso: pessoa.lastLoginAt,
      precisaTrocarSenha: pessoa.mustChangePassword,
    },
    treinamentos: matriculas.map((m) => ({
      curso: m.course.title,
      obrigatorio: m.mandatory,
      prazo: m.dueDate,
      matriculadoEm: m.assignedAt,
      progressoPercent: percentPor.get(m.courseId)?.percent ?? 0,
      concluidoEm: percentPor.get(m.courseId)?.completedAt ?? null,
    })),
    certificados: certificados.map((c) => ({
      curso: c.course.title,
      codigo: c.code,
      emitidoEm: c.issuedAt,
    })),
    treinamentosPresenciais: externas.map((e) => ({
      curso: e.course.title,
      concluidoEm: e.concluidoEm,
      instrutor: e.instrutor,
      observacao: e.observacao,
    })),
    documentosAceitos: aceites.map((a) => ({
      documento: a.documento.titulo,
      versaoAceita: a.versao,
      aceitoEm: a.aceitoEm,
      // Vazio depois da anonimização por retenção — e mostrar vazio é honesto:
      // significa que o dado existiu e foi descartado no prazo.
      origem: a.ip || null,
    })),
    presencas: presencas.map((p) => ({
      treinamento: p.sessao.course.title,
      registradaEm: p.registradaEm,
      origem: p.ip || null,
    })),
    provas: tentativas.map((t) => ({
      prova: t.prova.titulo,
      realizadaEm: t.createdAt,
      nota: t.nota,
      acertos: `${t.acertos} de ${t.total}`,
      aprovado: t.aprovado,
    })),
    registrosDeAcesso: acessos.map((a) => ({ acao: a.action, quando: a.createdAt })),
  };
}

/** Quantos itens há em cada grupo — para a tela resumir antes de detalhar. */
export function contarMeusDados(dados: MeusDados): { rotulo: string; quantos: number }[] {
  return [
    { rotulo: "Treinamentos", quantos: dados.treinamentos.length },
    { rotulo: "Certificados", quantos: dados.certificados.length },
    { rotulo: "Presenciais", quantos: dados.treinamentosPresenciais.length },
    { rotulo: "Documentos aceitos", quantos: dados.documentosAceitos.length },
    { rotulo: "Listas de presença", quantos: dados.presencas.length },
    { rotulo: "Provas", quantos: dados.provas.length },
    { rotulo: "Registros de acesso", quantos: dados.registrosDeAcesso.length },
  ];
}
