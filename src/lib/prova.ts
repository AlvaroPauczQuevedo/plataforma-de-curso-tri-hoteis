/**
 * Correção de prova.
 *
 * A lógica vive aqui, pura e sem banco, porque três lugares precisam dela e
 * precisam concordar: a action que grava a tentativa, a tela que mostra o
 * resultado e os testes. Duplicada, divergiria em silêncio — e uma nota
 * calculada de dois jeitos diferentes é pior do que nota nenhuma.
 */

export type AlternativaCorrigivel = {
  id: string;
  correta: boolean;
};

export type QuestaoCorrigivel = {
  id: string;
  enunciado: string;
  alternativas: AlternativaCorrigivel[];
};

/** O que o funcionário marcou: id da questão -> id da alternativa. */
export type Respostas = Record<string, string>;

export type QuestaoCorrigida = {
  questaoId: string;
  enunciado: string;
  alternativaMarcada: string | null;
  alternativaCorreta: string | null;
  acertou: boolean;
};

export type Resultado = {
  acertos: number;
  total: number;
  nota: number;
  aprovado: boolean;
  questoes: QuestaoCorrigida[];
};

/**
 * Percentual inteiro de acerto.
 *
 * Arredonda para o inteiro mais próximo. Prova sem questão devolve zero em vez
 * de dividir por zero — e uma prova vazia não deveria ser publicável, mas o
 * cálculo não é o lugar de descobrir isso.
 */
export function calcularNota(acertos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((acertos / total) * 100);
}

/**
 * Corrige uma tentativa.
 *
 * Questão sem alternativa correta cadastrada conta como erro para quem
 * responde. É a escolha conservadora: dar o ponto premiaria uma questão
 * malformada, e nesse caso o problema é da prova, não de quem a fez — mas
 * inflar a nota esconderia o defeito em vez de expô-lo.
 *
 * Questão não respondida também é erro. Deixar em branco não pode valer mais
 * do que arriscar.
 */
export function corrigir(
  questoes: QuestaoCorrigivel[],
  respostas: Respostas,
  notaMinima: number
): Resultado {
  const corrigidas: QuestaoCorrigida[] = questoes.map((questao) => {
    const correta = questao.alternativas.find((a) => a.correta) ?? null;
    const marcada = respostas[questao.id] ?? null;

    return {
      questaoId: questao.id,
      enunciado: questao.enunciado,
      alternativaMarcada: marcada,
      alternativaCorreta: correta?.id ?? null,
      acertou: correta !== null && marcada === correta.id,
    };
  });

  const acertos = corrigidas.filter((q) => q.acertou).length;
  const total = questoes.length;
  const nota = calcularNota(acertos, total);

  return {
    acertos,
    total,
    nota,
    aprovado: total > 0 && nota >= notaMinima,
    questoes: corrigidas,
  };
}

/**
 * Uma prova só pode ser publicada quando é respondível.
 *
 * A validação é aqui, junto da correção, porque as duas dependem da mesma
 * definição de "questão válida". Publicar uma prova com questão sem gabarito
 * geraria reprovação impossível de contestar.
 */
export function motivoParaNaoPublicar(
  questoes: QuestaoCorrigivel[]
): string | null {
  if (questoes.length === 0) {
    return "Adicione ao menos uma questão antes de publicar.";
  }

  const semGabarito = questoes.filter(
    (q) => !q.alternativas.some((a) => a.correta)
  ).length;
  if (semGabarito > 0) {
    return `${semGabarito} questão(ões) ainda não têm alternativa correta marcada.`;
  }

  const semAlternativasSuficientes = questoes.filter(
    (q) => q.alternativas.length < 2
  ).length;
  if (semAlternativasSuficientes > 0) {
    return `${semAlternativasSuficientes} questão(ões) têm menos de duas alternativas.`;
  }

  return null;
}
