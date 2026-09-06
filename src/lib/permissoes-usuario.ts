/**
 * Quem pode alterar a conta de quem.
 *
 * A decisão vive aqui, em funções puras, porque três lugares precisam dela e
 * precisam concordar: as server actions (que barram de verdade), as telas do
 * painel (que escondem o que seria recusado) e os testes. Duplicada, a regra
 * divergiria em silêncio — a tela ofereceria um botão que o servidor recusa.
 *
 * Duas regras se somam:
 *
 *  1. Conta protegida ("proprietário") só é alterada pelo próprio titular.
 *  2. Administrador comum só alcança usuários do seu próprio departamento.
 *
 * O proprietário é isento da regra 2 de propósito: ele existe para administrar
 * a plataforma inteira. Sem a isenção ninguém poderia definir o departamento de
 * um usuário recém-criado e o sistema travaria sozinho.
 */

/**
 * Quem age.
 *
 * `departamentos` traz o principal e os adicionais juntos, porque para decidir
 * alcance os dois valem igual. A distinção entre eles existe em outro lugar:
 * relatórios e conformidade agrupam pelo principal, para que a soma das
 * colunas continue batendo com o total de funcionários.
 */
export type Ator = {
  id: string;
  protegido: boolean;
  departamentos: string[];
  /**
   * Unidades (hotéis) que este administrador alcança — principal e adicionais.
   *
   * Dimensão SEPARADA do departamento: um é o lugar, o outro é a função. Ver
   * `dentroDoAlcance` para como as duas se combinam.
   */
  unidades: string[];
};

export type Alvo = {
  id: string;
  name: string;
  protegido: boolean;
  departmentId: string | null;
  unidadeId: string | null;
};

const SEM_DEPARTAMENTO_CONTEUDO =
  "Sua conta ainda não tem departamento definido, então não alcança nenhum conteúdo. " +
  "Peça ao proprietário da plataforma para definir o seu departamento.";

const SEM_DEPARTAMENTO =
  "Sua conta ainda não tem departamento definido, então não alcança nenhum usuário. " +
  "Peça ao proprietário da plataforma para definir o seu departamento.";

/**
 * Nem departamento, nem unidade.
 *
 * Substitui `SEM_DEPARTAMENTO` no alcance sobre PESSOAS, porque agora há duas
 * formas de ter alcance e citar só uma delas mandaria o gerente de hotel pedir
 * a coisa errada ao proprietário.
 */
const SEM_ALCANCE =
  "Sua conta ainda não tem departamento nem unidade definidos, então não alcança " +
  "nenhum usuário. Peça ao proprietário da plataforma para definir o seu alcance.";

/**
 * Devolve `null` quando o ator pode alterar o alvo, ou a frase que explica a
 * recusa — a mesma exibida na tela e devolvida pela action.
 */
export function motivoDeBloqueio(alvo: Alvo, ator: Ator): string | null {
  if (alvo.id === ator.id) return null; // todo mundo mexe na própria conta

  if (alvo.protegido) {
    return `${alvo.name} é uma conta protegida e só pode ser alterada pelo próprio titular.`;
  }

  if (ator.protegido) return null; // o proprietário alcança a rede inteira

  return motivoForaDoAlcance(alvo, ator);
}

/**
 * A regra de alcance, com as DUAS dimensões.
 *
 * Cada dimensão **definida** restringe; a que estiver vazia não impõe nada:
 *
 *  - só departamentos → aquele setor, em toda a rede (o RH corporativo);
 *  - só unidades      → aquele hotel inteiro, em todos os setores (o gerente
 *                       da unidade, que é o caso de "cada hotel se administra");
 *  - as duas          → a interseção: "Recepção do Paranaguá";
 *  - nenhuma das duas → não alcança ninguém.
 *
 * **Interseção, e não união**, e a escolha é de segurança: acrescentar uma
 * restrição deve ESTREITAR o alcance, nunca alargá-lo. Assim um erro de
 * configuração produz "fulano não consegue editar quem deveria" — que aparece
 * no primeiro uso e se conserta — em vez de "fulano editou quem não devia",
 * que ninguém percebe.
 *
 * O último caso preserva o padrão seguro que já existia: conta administrativa
 * recém-criada, sem nada definido, enxerga mas não altera.
 */
function motivoForaDoAlcance(alvo: Alvo, ator: Ator): string | null {
  const temDepartamentos = ator.departamentos.length > 0;
  const temUnidades = ator.unidades.length > 0;

  if (!temDepartamentos && !temUnidades) return SEM_ALCANCE;

  if (temDepartamentos) {
    if (!alvo.departmentId || !ator.departamentos.includes(alvo.departmentId)) {
      return `${alvo.name} é de outro departamento. Você só altera usuários dos seus.`;
    }
  }

  if (temUnidades) {
    if (!alvo.unidadeId || !ator.unidades.includes(alvo.unidadeId)) {
      return `${alvo.name} é de outra unidade. Você só altera usuários dos hotéis que administra.`;
    }
  }

  return null;
}

/**
 * Devolve `null` quando o ator pode vincular alguém ao departamento indicado.
 *
 * Sem esta trava a regra do departamento não valeria nada: como toda conta pode
 * editar a si mesma, bastaria trocar o próprio departamento para alcançar
 * qualquer usuário. Vale ao criar e ao editar.
 */
export function motivoDeVinculoInvalido(
  ator: Ator,
  departmentId: string | null
): string | null {
  if (ator.protegido) return null;
  if (ator.departamentos.length === 0) return SEM_DEPARTAMENTO;

  if (!departmentId || !ator.departamentos.includes(departmentId)) {
    return "Você só pode vincular usuários aos seus próprios departamentos.";
  }

  return null;
}

/** Departamentos que este ator pode escolher num formulário. */
export function departamentosPermitidos<T extends { id: string }>(
  ator: Ator,
  todos: T[]
): T[] {
  if (ator.protegido) return todos;
  return todos.filter((d) => ator.departamentos.includes(d.id));
}

/**
 * Unidades que este ator pode escolher num formulário.
 *
 * Espelha `departamentosPermitidos`, com uma diferença que importa: quem **não
 * tem unidade definida** vê todas. É o caso do RH corporativo, que administra
 * um setor na rede inteira e precisa poder dizer em qual hotel a pessoa fica —
 * sua restrição é o departamento, não o lugar.
 *
 * Já quem tem unidades definidas vê só as suas: o gerente do Paranaguá não
 * cadastra ninguém em Curitiba. Sem este filtro, a tela ofereceria uma opção
 * que a trava do servidor recusaria depois — e a recusa depois de preencher o
 * formulário inteiro é a pior forma de dizer não.
 */
export function unidadesPermitidas<T extends { id: string }>(ator: Ator, todas: T[]): T[] {
  if (ator.protegido) return todas;
  if (ator.unidades.length === 0) return todas;
  return todas.filter((u) => ator.unidades.includes(u.id));
}

/**
 * Conteúdo (cursos, módulos, aulas) segue a mesma lógica das pessoas.
 *
 * O curso é a unidade que carrega o departamento; módulo e aula herdam o dele.
 * Curso sem departamento fica reservado ao proprietário — é o estado dos cursos
 * criados antes desta regra, e obriga uma atribuição consciente em vez de
 * deixá-los abertos a qualquer administrador por omissão.
 */
export type CursoComDono = {
  title: string;
  departmentId: string | null;
};

export function motivoDeBloqueioDeCurso(
  curso: CursoComDono,
  ator: Ator
): string | null {
  if (ator.protegido) return null; // o proprietário alcança todos os departamentos
  if (ator.departamentos.length === 0) return SEM_DEPARTAMENTO_CONTEUDO;

  if (curso.departmentId === null) {
    return `"${curso.title}" ainda não foi atribuído a um departamento. Só o proprietário da plataforma pode alterá-lo ou atribuí-lo.`;
  }

  if (!ator.departamentos.includes(curso.departmentId)) {
    return `"${curso.title}" pertence a outro departamento. Você só altera conteúdo dos seus.`;
  }

  return null;
}

/** Igual à de pessoas, mas para o departamento que um curso vai receber. */
export function motivoDeVinculoDeCursoInvalido(
  ator: Ator,
  departmentId: string | null
): string | null {
  if (ator.protegido) return null;
  if (ator.departamentos.length === 0) return SEM_DEPARTAMENTO_CONTEUDO;

  if (!departmentId || !ator.departamentos.includes(departmentId)) {
    return "Você só pode criar cursos nos seus próprios departamentos.";
  }

  return null;
}

/**
 * Prova segue exatamente a regra do curso: o departamento é o dono, e prova
 * sem departamento pertence ao proprietário.
 *
 * As funções são separadas das de curso apenas pelo texto da recusa. A regra é
 * a mesma de propósito — se um dia divergirem, será por decisão, não por
 * descuido de quem mexeu só num dos dois.
 */
export type ProvaComDono = {
  titulo: string;
  departmentId: string | null;
};

export function motivoDeBloqueioDeProva(
  prova: ProvaComDono,
  ator: Ator
): string | null {
  return motivoDeBloqueioDeCurso(
    { title: prova.titulo, departmentId: prova.departmentId },
    ator
  );
}

export function motivoDeVinculoDeProvaInvalido(
  ator: Ator,
  departmentId: string | null
): string | null {
  if (ator.protegido) return null;
  if (ator.departamentos.length === 0) return SEM_DEPARTAMENTO_CONTEUDO;

  if (!departmentId || !ator.departamentos.includes(departmentId)) {
    return "Você só pode criar provas nos seus próprios departamentos.";
  }

  return null;
}
