/**
 * Leitura da lista colada no cadastro de funcionários em lote.
 *
 * Existe porque a rede tem 25 hotéis para povoar e o cadastro é feito à mão,
 * uma pessoa por vez, por quem não tem terminal. O formulário simples continua
 * sendo o caminho para cadastrar UMA pessoa; isto é para quando chega a lista
 * de um hotel inteiro.
 *
 * Módulo sem banco nem sessão: aqui mora a regra de como um nome vira um
 * login, e regra sem teste é regra que muda sozinha. A action fica só com o
 * que depende do banco — quais nomes de usuário já existem.
 */
import {
  MAXIMO,
  motivoDeNomeInvalido,
  partesDoNome,
  sugerirNomeDeUsuario,
} from "@/lib/nome-de-usuario";

/**
 * Quantas pessoas um envio aceita de uma vez.
 *
 * O maior hotel da rede não chega perto disso. O teto existe para o engano de
 * colagem — a planilha inteira no lugar da coluna — parar com uma frase clara.
 */
export const MAXIMO_DE_PESSOAS = 200;

export type PessoaDoLote = {
  /** Como foi digitado, preservado para aparecer na lista de conferência. */
  nome: string;
  /** Cargo, quando a linha traz um depois do ponto e vírgula. */
  cargo: string | null;
  /** O login sugerido, já normalizado. Vazio quando não foi possível gerar. */
  usuario: string;
  /** Preenchido quando a linha não pode virar cadastro; `null` quando serve. */
  problema: string | null;
};

/**
 * Uma pessoa por linha, no formato `Nome Completo` ou `Nome Completo; Cargo`.
 *
 * O ponto e vírgula separa o cargo, e não a vírgula, porque nome de pessoa
 * leva vírgula com frequência ("Silva, Jr.") e cargo quase nunca leva ponto e
 * vírgula. Errar esse separador partiria nomes ao meio em silêncio.
 *
 * Linha vazia é descartada: colagem de planilha vem cheia delas.
 *
 * NÃO decide sobre repetição — nem dentro do texto, nem contra o banco. Isso é
 * `resolverConflitos`, que precisa saber o que já existe cadastrado.
 */
export function lerPessoas(texto: string): PessoaDoLote[] {
  const pessoas: PessoaDoLote[] = [];

  for (const linha of (texto ?? "").split(/\r?\n/)) {
    const cru = linha.trim();
    if (!cru) continue;

    const [nomeBruto, ...resto] = cru.split(";");
    const nome = nomeBruto.trim();
    const cargo = resto.join(";").trim() || null;

    if (!nome) {
      pessoas.push({ nome: cru, cargo, usuario: "", problema: "Linha sem nome." });
      continue;
    }

    const usuario = sugerirNomeDeUsuario(nome);
    const problema = usuario
      ? motivoDeNomeInvalido(usuario)
      : "Não foi possível gerar um nome de usuário a partir deste nome.";

    pessoas.push({ nome, cargo, usuario, problema });
  }

  return pessoas;
}

/**
 * Tenta desempatar quem caiu no mesmo nome de usuário.
 *
 * `sugerirNomeDeUsuario` devolve "primeiro.ultimo" e deixa o desempate para a
 * pessoa de propósito: só quem cadastra sabe quais dois "João Silva" são
 * gente diferente. Num lote de sessenta isso devolveria o trabalho manual que
 * este formulário existe para tirar.
 *
 * A saída é fazer o que a pessoa faria: acrescentar o nome do meio. É um login
 * que o dono reconhece — "joao.pereira.silva" — ao contrário de "joao.silva2",
 * que não diz nada a ninguém e some da memória no dia seguinte.
 *
 * Quando nem o nome do meio resolve, a linha volta marcada em vez de receber
 * um número: duas pessoas com nome inteiro idêntico são um caso que precisa de
 * olho humano, e inventar um sufixo aqui esconderia justamente isso.
 *
 * `jaExistentes` são os logins já gravados, em minúsculas.
 */
export function resolverConflitos(
  pessoas: PessoaDoLote[],
  jaExistentes: Set<string>
): PessoaDoLote[] {
  // Cópia: a função não altera o que recebeu, para a tela poder recomparar.
  const ocupados = new Set(jaExistentes);
  const saida: PessoaDoLote[] = [];

  for (const pessoa of pessoas) {
    if (pessoa.problema || !pessoa.usuario) {
      saida.push({ ...pessoa });
      continue;
    }

    if (!ocupados.has(pessoa.usuario)) {
      ocupados.add(pessoa.usuario);
      saida.push({ ...pessoa });
      continue;
    }

    const comMeio = comNomeDoMeio(pessoa.nome);
    if (comMeio && !ocupados.has(comMeio) && !motivoDeNomeInvalido(comMeio)) {
      ocupados.add(comMeio);
      saida.push({ ...pessoa, usuario: comMeio });
      continue;
    }

    saida.push({
      ...pessoa,
      problema:
        `O nome de usuário "${pessoa.usuario}" já está em uso e o nome do meio ` +
        "não resolveu. Cadastre esta pessoa pelo formulário individual, " +
        "escolhendo um login que a diferencie.",
    });
  }

  return saida;
}

/**
 * "João Pereira da Silva" -> "joao.pereira.silva".
 *
 * Usa TODAS as partes, e não só três: quem tem dois nomes do meio precisa dos
 * dois para se distinguir de quem tem um. Os conectivos ficam de fora pela
 * mesma razão de sempre — "da" não diferencia ninguém.
 */
function comNomeDoMeio(nomeCompleto: string): string {
  const partes = partesDoNome(nomeCompleto);
  if (partes.length === 0) return "";
  return partes.join(".").slice(0, MAXIMO).replace(/[._-]+$/, "");
}
