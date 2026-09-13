import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessaoDeApi } from "@/lib/session";
import { dataCsv, dataHoraCsv, gerarCsv, nomeDeArquivoCsv, respostaCsv, simNaoCsv } from "@/lib/csv";
import { levantarObrigacoes } from "@/lib/conformidade";
import { ROTULO_DA_SITUACAO } from "@/lib/relatorio-gerencial";
import { situacaoDoDocumento } from "@/lib/documentos";

/**
 * Exportação em planilha do que o painel mostra.
 *
 * Uma rota para as três fontes, e não três rotas, porque a parte que precisa
 * estar certa é a mesma nas três: quem pode baixar, o teto de linhas e o
 * formato do arquivo. Repetida em três lugares, ela seria corrigida em dois.
 *
 * **Alcance.** Qualquer ADMIN exporta a rede inteira, e é deliberado: é
 * exatamente o que a Conformidade e a lista de usuários já mostram na tela para
 * qualquer administrador. Nesta plataforma o recorte por departamento restringe
 * quem **altera**, não quem lê — ver `alcance-admin.ts`. Uma exportação mais
 * fechada que a tela não protegeria nada: bastaria copiar da tela.
 *
 * O papel é relido do banco por `sessaoDeApi`, e não tirado do token, porque a
 * sessão dura 8 horas: quem foi rebaixado nesse intervalo não leva a folha da
 * rede junto.
 */

/**
 * Teto de linhas por arquivo.
 *
 * Vinte mil cobre a rede inteira com folga larga — 25 hotéis, algumas centenas
 * de pessoas, alguns treinamentos cada. O teto não está aqui por causa do
 * Excel, que aguenta muito mais: está porque a montagem acontece INTEIRA em
 * memória antes de responder, e um pedido sem filtro numa base que cresceu
 * seguraria o processo inteiro. É o mesmo cuidado das outras telas paginadas.
 */
const LIMITE_DE_LINHAS = 20_000;

type Planilha = { nome: string; cabecalho: string[]; linhas: unknown[][] };

/* ------------------------------------------------------------ conformidade */

/**
 * Quem deve o quê, nome a nome — a versão em planilha da tela de Conformidade.
 *
 * Aceita os MESMOS parâmetros da tela, com os mesmos nomes, para o botão poder
 * repassar a barra de endereço como está: quem filtrou a Recepção do Canela
 * quer o arquivo daquela equipe, não o da rede.
 */
async function planilhaDeConformidade(params: URLSearchParams): Promise<Planilha> {
  const { linhas } = await levantarObrigacoes({
    q: params.get("q") || undefined,
    departamentoId: params.get("departamento") || undefined,
    unidadeId: params.get("hotel") || undefined,
  });

  const situacao = params.get("situacao");
  const filtradas = situacao ? linhas.filter((l) => l.situacao === situacao) : linhas;

  /*
    A tela busca nome e curso só das 25 linhas visíveis. Aqui não dá: a planilha
    é a lista inteira, e é justamente para isso que ela existe. Continuam sendo
    duas consultas, não uma por linha.
  */
  const [pessoas, cursos] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(filtradas.map((l) => l.userId))] } },
      select: {
        id: true,
        name: true,
        username: true,
        position: true,
        department: { select: { name: true } },
        unidade: { select: { name: true } },
      },
    }),
    db.course.findMany({
      where: { id: { in: [...new Set(filtradas.map((l) => l.courseId))] } },
      select: { id: true, title: true },
    }),
  ]);

  const pessoaPor = new Map(pessoas.map((p) => [p.id, p]));
  const cursoPor = new Map(cursos.map((c) => [c.id, c]));

  return {
    nome: "conformidade",
    cabecalho: [
      "Funcionário",
      "Usuário",
      "Cargo",
      "Departamento",
      "Hotel",
      "Treinamento",
      "Prazo",
      "Progresso (%)",
      "Situação",
      "Dias de atraso",
    ],
    linhas: filtradas.map((l) => {
      const pessoa = pessoaPor.get(l.userId);
      return [
        pessoa?.name ?? "",
        pessoa?.username ?? "",
        pessoa?.position ?? "",
        pessoa?.department?.name ?? "",
        pessoa?.unidade?.name ?? "",
        cursoPor.get(l.courseId)?.title ?? "",
        dataCsv(l.dueDate),
        l.percent,
        ROTULO_DA_SITUACAO[l.situacao],
        // Só quem está de fato atrasado. Pôr "0" em quem está em dia
        // convidaria a somar a coluna e chegar a um número sem sentido.
        l.diasRestantes !== null && l.diasRestantes < 0 ? Math.abs(l.diasRestantes) : "",
      ];
    }),
  };
}

/* ------------------------------------------------------------ funcionários */

/** O cadastro, com os mesmos filtros da tela de Usuários. */
async function planilhaDeFuncionarios(params: URLSearchParams): Promise<Planilha> {
  const papel = params.get("papel");
  const status = params.get("status");
  const q = params.get("q");

  const pessoas = await db.user.findMany({
    where: {
      ...(papel === "admin" ? { role: "ADMIN" as const } : {}),
      ...(papel === "funcionario" ? { role: "EMPLOYEE" as const } : {}),
      ...(status ? { active: status === "ativo" } : {}),
      ...(params.get("departamento") ? { departmentId: params.get("departamento")! } : {}),
      ...(params.get("hotel") ? { unidadeId: params.get("hotel")! } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { position: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      name: true,
      username: true,
      email: true,
      telefone: true,
      position: true,
      role: true,
      active: true,
      createdAt: true,
      department: { select: { name: true } },
      unidade: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { name: "asc" },
  });

  return {
    nome: "usuarios",
    cabecalho: [
      "Nome",
      "Usuário",
      "E-mail",
      "Telefone",
      "Cargo",
      "Departamento",
      "Hotel",
      "Perfil",
      "Ativo",
      "Matrículas",
      "Cadastrado em",
    ],
    linhas: pessoas.map((p) => [
      p.name,
      p.username,
      p.email ?? "",
      /*
        O telefone vai como texto por causa do zero: guardado com DDI
        (5541999999999), ele não tem zero à esquerda hoje — mas qualquer número
        longo o Excel converte para notação científica (5,54E+12) e o número
        deixa de ser discável. O apóstrofo da coluna resolve, e é o mesmo
        mecanismo do escape de fórmula.
      */
      p.telefone ? `'${p.telefone}` : "",
      p.position ?? "",
      p.department?.name ?? "",
      p.unidade?.name ?? "",
      p.role === "ADMIN" ? "Administrador" : "Funcionário",
      simNaoCsv(p.active),
      p._count.enrollments,
      dataCsv(p.createdAt),
    ]),
  };
}

/* -------------------------------------------------------------- documentos */

/**
 * Quem aceitou cada política publicada, e quem falta.
 *
 * Uma consulta por documento, de propósito: reusa `situacaoDoDocumento`, que é
 * a mesma função da tela "Ver quem falta". Documentos são poucos — políticas,
 * não conteúdo —, e o custo de algumas consultas a mais compra a garantia de
 * que a planilha e a tela nunca discordem sobre quem está pendente.
 */
async function planilhaDeDocumentos(params: URLSearchParams): Promise<Planilha> {
  const documentos = await db.documento.findMany({
    where: {
      publicado: true,
      ...(params.get("documento") ? { id: params.get("documento")! } : {}),
    },
    select: { id: true, titulo: true, versao: true },
    orderBy: { titulo: "asc" },
  });

  const linhas: unknown[][] = [];

  for (const documento of documentos) {
    const { linhas: aceites } = await situacaoDoDocumento(documento.id);

    for (const aceite of aceites) {
      linhas.push([
        documento.titulo,
        documento.versao,
        aceite.nome,
        {
          aceito: "Aceito",
          pendente: "Pendente",
          revisado: "Revisado — aceite vencido",
        }[aceite.situacao],
        aceite.versaoAceita ?? "",
        dataHoraCsv(aceite.aceitoEm),
      ]);
    }
  }

  return {
    nome: "aceites-de-documentos",
    cabecalho: [
      "Documento",
      "Versão atual",
      "Funcionário",
      "Situação",
      "Versão aceita",
      "Aceito em",
    ],
    linhas,
  };
}

/* ------------------------------------------------------------------- rota */

const FONTES = {
  conformidade: planilhaDeConformidade,
  usuarios: planilhaDeFuncionarios,
  documentos: planilhaDeDocumentos,
} as const;

export async function GET(request: NextRequest) {
  const usuario = await sessaoDeApi();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (usuario.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const fonte = params.get("fonte") ?? "";

  /*
    Lista fechada, e não um nome que vira consulta. A alternativa preguiçosa —
    aceitar o nome da tabela e montar o `select` a partir dele — transformaria
    esta rota num leitor genérico do banco, com o `passwordHash` de todo mundo
    a um parâmetro de distância.
  */
  if (!(fonte in FONTES)) {
    return NextResponse.json(
      { error: `Relatório desconhecido. Use um destes: ${Object.keys(FONTES).join(", ")}.` },
      { status: 400 }
    );
  }

  const planilha = await FONTES[fonte as keyof typeof FONTES](params);

  /*
    Recusa em vez de cortar.

    Entregar as primeiras 20 mil linhas de uma folha de conformidade seria pior
    do que não entregar nada: o arquivo abriria, pareceria completo, e quem o
    levasse para a auditoria estaria afirmando que a rede tem menos pendências
    do que tem. Relatório incompleto que se anuncia completo é o defeito mais
    caro que este projeto pode produzir.
  */
  if (planilha.linhas.length > LIMITE_DE_LINHAS) {
    return NextResponse.json(
      {
        error:
          `A exportação tem ${planilha.linhas.length} linhas e o limite é ${LIMITE_DE_LINHAS}. ` +
          "Filtre por hotel, departamento ou situação e baixe em partes — " +
          "um arquivo cortado pela metade seria pior do que nenhum.",
      },
      { status: 400 }
    );
  }

  const dia = new Date().toISOString().slice(0, 10);

  return respostaCsv(
    nomeDeArquivoCsv([planilha.nome, await sufixoDoFiltro(params), dia]),
    gerarCsv(planilha.cabecalho, planilha.linhas)
  );
}

/**
 * O filtro aplicado, no nome do arquivo.
 *
 * `conformidade-recepcao-2026-09-12.csv` diz o que tem dentro; três arquivos
 * chamados `conformidade.csv` na pasta de downloads não dizem nada, e é assim
 * que alguém anexa o recorte errado num e-mail para a auditoria.
 */
async function sufixoDoFiltro(params: URLSearchParams): Promise<string> {
  const partes: string[] = [];

  const hotelId = params.get("hotel");
  if (hotelId) {
    const hotel = await db.unidade.findUnique({ where: { id: hotelId }, select: { name: true } });
    if (hotel) partes.push(hotel.name);
  }

  const departamentoId = params.get("departamento");
  if (departamentoId) {
    const departamento = await db.department.findUnique({
      where: { id: departamentoId },
      select: { name: true },
    });
    if (departamento) partes.push(departamento.name);
  }

  const situacao = params.get("situacao");
  if (situacao && situacao in ROTULO_DA_SITUACAO) {
    partes.push(ROTULO_DA_SITUACAO[situacao as keyof typeof ROTULO_DA_SITUACAO]);
  }

  return partes.join("-");
}
