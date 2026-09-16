/**
 * As regras de "este curso é obrigatório para tal setor".
 *
 * Saíram de dentro da action quando a obrigatoriedade passou a aceitar VÁRIOS
 * setores de uma vez: as mesmas conferências valeriam nos dois caminhos, e
 * duas cópias de uma validação acabam divergindo — a versão em lote aceitaria
 * um prazo que a individual recusa, ou o contrário.
 *
 * ---
 *
 * **Por que o lote existe.**
 *
 * Nesta rede o departamento é o hotel. Marcar "Brigada de incêndio" como
 * obrigatória para as 25 casas eram 25 idas ao formulário, e isso se repetia
 * inteiro a cada curso novo. Com seis treinamentos obrigatórios são 150
 * marcações à mão — e basta esquecer uma para um hotel ficar irregular sem
 * ninguém notar, que é exatamente o erro que a Conformidade não consegue
 * apontar (ela mostra o setor em dia, porque ele não deve nada).
 */

/** `null` quando o prazo serve; a mensagem para a tela quando não serve. */
export function motivoDePrazoInvalido(prazoDias: number | null): string | null {
  if (prazoDias === null) return null;
  if (!Number.isInteger(prazoDias) || prazoDias < 1) {
    return "O prazo deve ser um número de dias maior que zero.";
  }
  return null;
}

/**
 * Idem para a validade.
 *
 * Em MESES, e não em dias, porque é assim que a norma fala: "reciclagem
 * anual", "a cada dois anos". Converter para dias na tela faria quem cadastra
 * calcular 365 de cabeça e errar em ano bissexto.
 */
export function motivoDeValidadeInvalida(validadeMeses: number | null): string | null {
  if (validadeMeses === null) return null;
  if (!Number.isInteger(validadeMeses) || validadeMeses < 1) {
    return "A validade deve ser um número de meses maior que zero.";
  }
  return null;
}

export type SeparacaoDeObrigatoriedades = {
  /** Os que vão virar registro novo. */
  novos: string[];
  /** Os que já eram obrigatórios e foram pulados. */
  jaEram: string[];
};

/**
 * Separa o que é novo do que já valia.
 *
 * Setor já obrigatório é **pulado, não recusado**. É a diferença entre uma
 * falha de validação e um pedido já atendido: quem marcou as 25 casas querendo
 * "que este curso seja obrigatório em todas" teve o pedido cumprido nas 25,
 * ainda que três já estivessem lá. Recusar o lote inteiro por causa delas
 * obrigaria a pessoa a descobrir quais são e desmarcá-las uma a uma — o
 * trabalho manual que o lote existe para tirar.
 *
 * Repetição na própria seleção também some: marcar duas vezes é marcar uma.
 */
export function separarObrigatoriedades(
  selecionados: readonly string[],
  jaExistentes: ReadonlySet<string>
): SeparacaoDeObrigatoriedades {
  const novos: string[] = [];
  const jaEram: string[] = [];
  const vistos = new Set<string>();

  for (const id of selecionados) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);

    if (jaExistentes.has(id)) jaEram.push(id);
    else novos.push(id);
  }

  return { novos, jaEram };
}

/**
 * A frase que a tela mostra depois do lote.
 *
 * Mora aqui, e não na action, porque é o tipo de texto que só se confere com
 * uma tabela de casos — e porque errar o plural num aviso que fala de
 * matrícula obrigatória deixa quem lê em dúvida sobre o que foi feito.
 */
export function resumoDoLote(entrada: {
  novos: number;
  jaEram: number;
  matriculas: number;
}): string {
  const partes: string[] = [];

  if (entrada.novos === 0) {
    partes.push("Nenhum setor novo: o curso já era obrigatório em todos os selecionados.");
  } else {
    partes.push(
      entrada.novos === 1
        ? "Curso obrigatório para 1 setor."
        : `Curso obrigatório para ${entrada.novos} setores.`
    );
  }

  if (entrada.jaEram > 0) {
    partes.push(
      entrada.jaEram === 1
        ? "1 já era e foi mantido."
        : `${entrada.jaEram} já eram e foram mantidos.`
    );
  }

  if (entrada.matriculas > 0) {
    partes.push(
      entrada.matriculas === 1
        ? "1 funcionário matriculado."
        : `${entrada.matriculas} funcionários matriculados.`
    );
  } else if (entrada.novos > 0) {
    partes.push("Todos já estavam matriculados.");
  }

  return partes.join(" ");
}
