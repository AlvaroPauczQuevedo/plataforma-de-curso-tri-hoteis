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
};

export type Alvo = {
  id: string;
  name: string;
  protegido: boolean;
  departmentId: string | null;
};

const SEM_DEPARTAMENTO_CONTEUDO =
  "Sua conta ainda não tem departamento definido, então não alcança nenhum conteúdo. " +
  "Peça ao proprietário da plataforma para definir o seu departamento.";

const SEM_DEPARTAMENTO =
  "Sua conta ainda não tem departamento definido, então não alcança nenhum usuário. " +
  "Peça ao proprietário da plataforma para definir o seu departamento.";

/**
 * Devolve `null` quando o ator pode alterar o alvo, ou a frase que explica a
 * recusa — a mesma exibida na tela e devolvida pela action.
 */
export function motivoDeBloqueio(alvo: Alvo, ator: Ator): string | null {
  if (alvo.id === ator.id) return null; // todo mundo mexe na própria conta

  if (alvo.protegido) {
    return `${alvo.name} é uma conta protegida e só pode ser alterada pelo próprio titular.`;
  }

  if (ator.protegido) return null; // o proprietário alcança todos os departamentos
  if (ator.departamentos.length === 0) return SEM_DEPARTAMENTO;

  if (!alvo.departmentId || !ator.departamentos.includes(alvo.departmentId)) {
    return `${alvo.name} é de outro departamento. Você só altera usuários dos seus.`;
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
