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

export type Ator = {
  id: string;
  protegido: boolean;
  departmentId: string | null;
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
  if (!ator.departmentId) return SEM_DEPARTAMENTO;

  if (alvo.departmentId !== ator.departmentId) {
    return `${alvo.name} é de outro departamento. Você só altera usuários do seu.`;
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
  if (!ator.departmentId) return SEM_DEPARTAMENTO;

  if (departmentId !== ator.departmentId) {
    return "Você só pode vincular usuários ao seu próprio departamento.";
  }

  return null;
}

/** Departamentos que este ator pode escolher num formulário. */
export function departamentosPermitidos<T extends { id: string }>(
  ator: Ator,
  todos: T[]
): T[] {
  if (ator.protegido) return todos;
  return todos.filter((d) => d.id === ator.departmentId);
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
  if (!ator.departmentId) return SEM_DEPARTAMENTO_CONTEUDO;

  if (curso.departmentId === null) {
    return `"${curso.title}" ainda não foi atribuído a um departamento. Só o proprietário da plataforma pode alterá-lo ou atribuí-lo.`;
  }

  if (curso.departmentId !== ator.departmentId) {
    return `"${curso.title}" pertence a outro departamento. Você só altera conteúdo do seu.`;
  }

  return null;
}

/** Igual à de pessoas, mas para o departamento que um curso vai receber. */
export function motivoDeVinculoDeCursoInvalido(
  ator: Ator,
  departmentId: string | null
): string | null {
  if (ator.protegido) return null;
  if (!ator.departmentId) return SEM_DEPARTAMENTO_CONTEUDO;

  if (departmentId !== ator.departmentId) {
    return "Você só pode criar cursos no seu próprio departamento.";
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
  if (!ator.departmentId) return SEM_DEPARTAMENTO_CONTEUDO;

  if (departmentId !== ator.departmentId) {
    return "Você só pode criar provas no seu próprio departamento.";
  }

  return null;
}
