/**
 * Quais aulas estão liberadas quando o curso exige ordem.
 *
 * Função pura, sem banco: recebe as aulas já na ordem e o conjunto das
 * concluídas, e devolve o mapa inteiro numa passada.
 *
 * Existe porque a tela do curso resolvia isto chamando `isLessonUnlocked`
 * uma vez por aula, e cada chamada fazia três consultas — a aula, todos os
 * módulos do curso e o progresso. Um curso de dezesseis aulas montava a
 * página com quase cinquenta idas ao banco, em série, para responder algo
 * que a própria tela já tinha em memória: ela acabara de carregar as aulas
 * em ordem e o progresso de todas elas.
 *
 * Sendo pura, também dá para testar a regra de liberação sem subir banco.
 */
export type AulaParaLiberacao = { id: string; required: boolean };

export function mapaDeLiberacao(
  /** Aulas na ordem em que aparecem no curso (módulo, depois aula). */
  aulasEmOrdem: AulaParaLiberacao[],
  /** Ids das aulas que a pessoa já concluiu. */
  concluidas: Set<string>,
  /** `false` libera tudo — é o curso sem ordem obrigatória. */
  sequencial: boolean
): Map<string, boolean> {
  const liberadas = new Map<string, boolean>();

  if (!sequencial) {
    for (const aula of aulasEmOrdem) liberadas.set(aula.id, true);
    return liberadas;
  }

  /*
    Só as aulas obrigatórias trancam as seguintes. Uma aula opcional pulada
    não pode travar o curso — se travasse, "opcional" não significaria nada.

    Contamos as pendentes que ficaram para trás em vez de reexaminar todas
    as anteriores a cada passo: o resultado é o mesmo e a passada é única.
  */
  let obrigatoriasPendentesAntes = 0;

  for (const aula of aulasEmOrdem) {
    liberadas.set(aula.id, obrigatoriasPendentesAntes === 0);
    if (aula.required && !concluidas.has(aula.id)) {
      obrigatoriasPendentesAntes++;
    }
  }

  return liberadas;
}
