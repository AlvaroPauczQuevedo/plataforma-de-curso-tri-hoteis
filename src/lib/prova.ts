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

/**
 * O resultado como ele pode ser MOSTRADO a quem acabou de responder.
 *
 * Reprovado não vê o gabarito: vê quais errou, e volta a estudar. Aprovado vê
 * tudo, porque aí a revisão só reforça o que a pessoa já demonstrou saber.
 *
 * A remoção é aqui, no servidor, e não na tela. Esconder na interface deixaria
 * a resposta certa viajando no corpo da requisição, a um clique de distância no
 * inspetor do navegador — e uma prova cujo gabarito acompanha o enunciado não
 * avalia nada. Pela mesma razão a correção já vive no servidor.
 *
 * O que fica GRAVADO na tentativa continua completo: a estatística por questão
 * precisa saber o que era certo, e o registro de uma prova não pode ser
 * incompleto. O corte vale só para o que é devolvido a quem respondeu.
 */
export function comoMostrarAoAluno(resultado: Resultado): Resultado {
  if (resultado.aprovado) return resultado;

  return {
    ...resultado,
    questoes: resultado.questoes.map((q) => ({ ...q, alternativaCorreta: null })),
  };
}

/* ------------------------------------------------------------ estatística */

export type TentativaResumida = {
  userId: string;
  nome: string;
  nota: number;
  aprovado: boolean;
  quando: Date;
  /** O gabarito congelado daquela tentativa, como foi gravado. */
  questoes: QuestaoCorrigida[];
};

export type DesempenhoPorPessoa = {
  userId: string;
  nome: string;
  tentativas: number;
  melhorNota: number;
  aprovado: boolean;
  ultima: Date;
};

export type DesempenhoPorQuestao = {
  questaoId: string;
  enunciado: string;
  respostas: number;
  erros: number;
  /** Percentual de erro, inteiro. */
  percentualDeErro: number;
};

export type EstatisticaDaProva = {
  pessoas: DesempenhoPorPessoa[];
  questoes: DesempenhoPorQuestao[];
  /** Percentual de pessoas aprovadas — conta gente, não tentativa. */
  taxaDeAprovacao: number;
  mediaDasMelhores: number;
};

/**
 * O que as tentativas dizem sobre a prova e sobre quem a fez.
 *
 * Duas leituras diferentes, e a distinção importa:
 *
 *  - **Por pessoa**, vale a MELHOR nota, porque refazer é permitido e o que
 *    interessa saber é se a pessoa domina o assunto hoje — não se errou na
 *    primeira. Contar tentativas puniria justamente quem voltou para estudar.
 *  - **Por questão**, valem TODAS as tentativas, porque aqui a pergunta é
 *    outra: quais questões o pessoal erra muito. Uma questão que quase todo
 *    mundo erra costuma indicar treinamento que não cobriu o assunto — ou
 *    enunciado ambíguo, que é problema da prova e não de quem responde.
 *
 * Pura e sem banco, como o resto deste módulo: a estatística de uma prova é
 * exatamente o tipo de conta que precisa de teste e não precisa de servidor.
 */
export function estatisticasDaProva(
  tentativas: TentativaResumida[]
): EstatisticaDaProva {
  const porPessoa = new Map<string, DesempenhoPorPessoa>();

  for (const t of tentativas) {
    const atual = porPessoa.get(t.userId);

    if (!atual) {
      porPessoa.set(t.userId, {
        userId: t.userId,
        nome: t.nome,
        tentativas: 1,
        melhorNota: t.nota,
        aprovado: t.aprovado,
        ultima: t.quando,
      });
      continue;
    }

    atual.tentativas += 1;
    atual.melhorNota = Math.max(atual.melhorNota, t.nota);
    atual.aprovado = atual.aprovado || t.aprovado;
    if (t.quando > atual.ultima) atual.ultima = t.quando;
  }

  const porQuestao = new Map<string, DesempenhoPorQuestao>();

  for (const t of tentativas) {
    for (const q of t.questoes) {
      const atual = porQuestao.get(q.questaoId) ?? {
        questaoId: q.questaoId,
        enunciado: q.enunciado,
        respostas: 0,
        erros: 0,
        percentualDeErro: 0,
      };

      atual.respostas += 1;
      if (!q.acertou) atual.erros += 1;
      porQuestao.set(q.questaoId, atual);
    }
  }

  const questoes = [...porQuestao.values()].map((q) => ({
    ...q,
    percentualDeErro: calcularNota(q.erros, q.respostas),
  }));

  // A que mais atrapalha aparece primeiro: é ela que se quer olhar.
  questoes.sort((a, b) => b.percentualDeErro - a.percentualDeErro);

  const pessoas = [...porPessoa.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  );
  const aprovadas = pessoas.filter((p) => p.aprovado).length;
  const somaDasMelhores = pessoas.reduce((soma, p) => soma + p.melhorNota, 0);

  return {
    pessoas,
    questoes,
    taxaDeAprovacao: calcularNota(aprovadas, pessoas.length),
    mediaDasMelhores:
      pessoas.length === 0 ? 0 : Math.round(somaDasMelhores / pessoas.length),
  };
}
