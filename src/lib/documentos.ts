/**
 * Aceite de documentos: política interna, NR, código de conduta.
 *
 * É a outra metade da conformidade. O curso prova que a pessoa foi TREINADA;
 * o aceite prova que ela foi INFORMADA — e é o que um auditor pede quando
 * pergunta onde está o registro de que fulano recebeu a política. Até aqui a
 * plataforma não tinha essa resposta.
 *
 * A regra que dá sentido ao módulo é a VERSÃO. Documento revisado é outro
 * texto: quem aceitou a v1 volta a dever quando sai a v2. Sem isso, uma
 * política atualizada continuaria "aceita" por gente que nunca leu a mudança,
 * o que é pior do que não ter registro — parece conformidade e não é.
 *
 * O alcance segue a mesma regra do treinamento obrigatório (ver
 * `lib/matricula-automatica`): vale o departamento principal E os adicionais.
 * Documento sem nenhum departamento alcança a rede inteira, que é o caso comum.
 */
import { db } from "@/lib/db";

export type SituacaoDoDocumento = "pendente" | "aceito" | "revisado";

export type DocumentoParaPessoa = {
  id: string;
  titulo: string;
  descricao: string | null;
  arquivoId: string;
  versao: number;
  situacao: SituacaoDoDocumento;
  /** A versão que a pessoa aceitou, se aceitou alguma. */
  versaoAceita: number | null;
  aceitoEm: Date | null;
};

/**
 * A situação de um documento para uma pessoa, como função pura.
 *
 * Três estados, e o do meio é o que importa:
 *
 *  - `pendente`  — nunca aceitou;
 *  - `aceito`    — aceitou a versão que está no ar;
 *  - `revisado`  — aceitou uma versão ANTERIOR. Deve de novo, e a tela precisa
 *                  dizer isso com outras palavras: quem já assinou uma vez
 *                  merece saber que o texto mudou, não receber a mesma
 *                  cobrança de quem nunca leu nada.
 */
export function situacaoDoAceite(
  versaoAtual: number,
  versaoAceita: number | null
): SituacaoDoDocumento {
  if (versaoAceita === null) return "pendente";
  return versaoAceita >= versaoAtual ? "aceito" : "revisado";
}

/** Um documento alcança esta pessoa? Sem departamentos, alcança todo mundo. */
export function documentoAlcanca(
  departamentosDoDocumento: string[],
  departamentosDaPessoa: string[]
): boolean {
  if (departamentosDoDocumento.length === 0) return true;
  return departamentosDoDocumento.some((d) => departamentosDaPessoa.includes(d));
}

/** Departamentos que valem para alcance: o principal mais os adicionais. */
export async function departamentosDaPessoa(userId: string): Promise<string[]> {
  const pessoa = await db.user.findUnique({
    where: { id: userId },
    select: {
      departmentId: true,
      departamentosExtras: { select: { departmentId: true } },
    },
  });
  if (!pessoa) return [];

  return [
    ...(pessoa.departmentId ? [pessoa.departmentId] : []),
    ...pessoa.departamentosExtras.map((d) => d.departmentId),
  ];
}

/**
 * Os documentos publicados que alcançam esta pessoa, já com a situação.
 *
 * Só publicados: rascunho não aparece para o funcionário, mesma lógica do
 * curso e da prova.
 */
export async function documentosDaPessoa(userId: string): Promise<DocumentoParaPessoa[]> {
  const setores = await departamentosDaPessoa(userId);

  const documentos = await db.documento.findMany({
    where: { publicado: true },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      arquivoId: true,
      versao: true,
      departamentos: { select: { departmentId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const alcancados = documentos.filter((d) =>
    documentoAlcanca(
      d.departamentos.map((x) => x.departmentId),
      setores
    )
  );

  if (alcancados.length === 0) return [];

  /*
    O aceite mais recente de cada documento. Uma pessoa pode ter várias linhas
    do mesmo documento (uma por versão aceita) — o histórico é o produto, e a
    situação olha a maior versão.
  */
  const aceites = await db.aceiteDeDocumento.findMany({
    where: { userId, documentoId: { in: alcancados.map((d) => d.id) } },
    select: { documentoId: true, versao: true, aceitoEm: true },
    orderBy: { versao: "desc" },
  });

  const maiorAceite = new Map<string, { versao: number; aceitoEm: Date }>();
  for (const a of aceites) {
    if (!maiorAceite.has(a.documentoId)) {
      maiorAceite.set(a.documentoId, { versao: a.versao, aceitoEm: a.aceitoEm });
    }
  }

  return alcancados.map((d) => {
    const aceite = maiorAceite.get(d.id) ?? null;
    return {
      id: d.id,
      titulo: d.titulo,
      descricao: d.descricao,
      arquivoId: d.arquivoId,
      versao: d.versao,
      situacao: situacaoDoAceite(d.versao, aceite?.versao ?? null),
      versaoAceita: aceite?.versao ?? null,
      aceitoEm: aceite?.aceitoEm ?? null,
    };
  });
}

export type LinhaDeAceite = {
  userId: string;
  nome: string;
  situacao: SituacaoDoDocumento;
  versaoAceita: number | null;
  aceitoEm: Date | null;
};

/**
 * Quem aceitou e quem falta, para um documento. É a tela que a auditoria pede.
 *
 * Percorre as pessoas ALCANÇADAS, e não só quem aceitou: a pergunta útil é
 * quem falta, e uma lista só de assinaturas não responde isso.
 */
export async function situacaoDoDocumento(documentoId: string): Promise<{
  linhas: LinhaDeAceite[];
  resumo: { total: number; aceito: number; pendente: number; revisado: number };
}> {
  const documento = await db.documento.findUnique({
    where: { id: documentoId },
    select: { versao: true, departamentos: { select: { departmentId: true } } },
  });
  if (!documento) return { linhas: [], resumo: { total: 0, aceito: 0, pendente: 0, revisado: 0 } };

  const setoresDoDocumento = documento.departamentos.map((d) => d.departmentId);

  /*
    Só funcionário ativo. Administrador fica de fora pela mesma razão da
    matrícula automática — quem publica a política não é cobrado por ela — e
    desligado não deve nada.
  */
  const pessoas = await db.user.findMany({
    where: {
      active: true,
      role: "EMPLOYEE",
      ...(setoresDoDocumento.length > 0
        ? {
            OR: [
              { departmentId: { in: setoresDoDocumento } },
              { departamentosExtras: { some: { departmentId: { in: setoresDoDocumento } } } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const aceites = await db.aceiteDeDocumento.findMany({
    where: { documentoId, userId: { in: pessoas.map((p) => p.id) } },
    select: { userId: true, versao: true, aceitoEm: true },
    orderBy: { versao: "desc" },
  });

  const maiorAceite = new Map<string, { versao: number; aceitoEm: Date }>();
  for (const a of aceites) {
    if (!maiorAceite.has(a.userId)) maiorAceite.set(a.userId, { versao: a.versao, aceitoEm: a.aceitoEm });
  }

  const linhas: LinhaDeAceite[] = pessoas.map((p) => {
    const aceite = maiorAceite.get(p.id) ?? null;
    return {
      userId: p.id,
      nome: p.name,
      situacao: situacaoDoAceite(documento.versao, aceite?.versao ?? null),
      versaoAceita: aceite?.versao ?? null,
      aceitoEm: aceite?.aceitoEm ?? null,
    };
  });

  const resumo = { total: linhas.length, aceito: 0, pendente: 0, revisado: 0 };
  for (const l of linhas) resumo[l.situacao] += 1;

  return { linhas, resumo };
}
