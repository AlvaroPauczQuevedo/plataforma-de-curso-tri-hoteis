/**
 * Nome de usuário: o identificador de acesso desta plataforma.
 *
 * A rede não tem matrícula nem e-mail corporativo — nenhum identificador
 * anterior para reaproveitar. Então quem cadastra escolhe o nome de usuário à
 * mão, e ele passa a ser a identidade da pessoa aqui dentro.
 *
 * Como é digitado por uma pessoa, o formato precisa ser imposto por código.
 * Sem isso é questão de tempo até alguém gravar "Maria Silva" com espaço e
 * maiúscula, e ninguém mais acertar aquele login: quem digita não sabe se o
 * espaço existe, se o M é maiúsculo, se o acento entra. O identificador de
 * acesso não pode depender de memória visual.
 *
 * As duas funções são separadas de propósito. `normalizar` é indulgente e
 * conserta o que dá para consertar — é o que roda no que o usuário digitou.
 * `motivoDeNomeInvalido` é rigorosa e recusa — é o que decide se grava. Juntar
 * as duas faria a validação aprovar coisas que ela mesma consertou, e o valor
 * gravado deixaria de ser previsível a partir do que foi digitado.
 */

/** Limites do identificador. O teto é folgado; o piso evita "a" e "jo". */
export const MINIMO = 3;
export const MAXIMO = 32;

/**
 * Arruma o que foi digitado: sem acento, minúsculo, espaços viram ponto.
 *
 * Aceita de bom grado o que uma pessoa apressada escreve — "  José Antônio  "
 * vira "jose.antonio" — porque recusar isso obrigaria quem cadastra a
 * transliterar nome próprio de cabeça, duzentas vezes seguidas. O que a função
 * NÃO faz é inventar: o que sobra depois da limpeza é conferido por
 * `motivoDeNomeInvalido`, e caractere que não pertence ao formato some aqui em
 * vez de virar erro — some de forma visível, porque o campo mostra o resultado.
 */
export function normalizarNomeDeUsuario(bruto: string): string {
  return (
    bruto
      .normalize("NFD")
      // Remove os sinais diacríticos que o NFD separou da letra.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      // Espaço em nome de usuário é o erro mais comum de quem digita um nome
      // próprio; o ponto é a convenção que a plataforma já usava nos e-mails.
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9._-]/g, "")
      // "maria..silva" costuma ser sobrenome perdido na limpeza, não intenção.
      .replace(/\.{2,}/g, ".")
      .replace(/^[._-]+/, "")
      .replace(/[._-]+$/, "")
  );
}

/**
 * `null` quando o nome serve; a mensagem para a tela quando não serve.
 *
 * Devolve texto em vez de lançar porque o chamador é uma server action, e o
 * padrão daqui é `{ ok: false, error }` — a mensagem vai direto para o campo.
 */
export function motivoDeNomeInvalido(nome: string): string | null {
  if (nome.length < MINIMO) {
    return `O nome de usuário precisa de ao menos ${MINIMO} caracteres.`;
  }
  if (nome.length > MAXIMO) {
    return `O nome de usuário passa de ${MAXIMO} caracteres.`;
  }
  if (!/^[a-z]/.test(nome)) {
    return "O nome de usuário precisa começar por letra.";
  }
  if (!/^[a-z0-9._-]+$/.test(nome)) {
    return "Use apenas letras minúsculas, números, ponto, hífen e sublinhado.";
  }
  if (/[._-]$/.test(nome)) {
    return "O nome de usuário não pode terminar em ponto, hífen ou sublinhado.";
  }
  if (/[._-]{2,}/.test(nome)) {
    return "O nome de usuário não pode ter dois separadores seguidos.";
  }
  return null;
}

/**
 * Sugestão a partir do nome completo, para o formulário preencher sozinho.
 *
 * Os conectivos saem: "Maria de Souza dos Santos" daria
 * "maria.de.souza.dos.santos", que é longo demais para alguém ditar no balcão.
 * O resultado é apenas uma sugestão — quem cadastra edita antes de salvar, e é
 * dele a palavra final, inclusive no desempate entre duas pessoas homônimas.
 */
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

export function sugerirNomeDeUsuario(nomeCompleto: string): string {
  const partes = normalizarNomeDeUsuario(nomeCompleto)
    .split(".")
    .filter((parte) => parte && !CONECTIVOS.has(parte));

  if (partes.length === 0) return "";
  // Primeiro e último: o nome do meio entra só no desempate, feito à mão por
  // quem cadastra, porque é ele que sabe quais duas pessoas são diferentes.
  const escolhidas = partes.length === 1 ? partes : [partes[0], partes[partes.length - 1]];

  return escolhidas.join(".").slice(0, MAXIMO).replace(/[._-]+$/, "");
}
