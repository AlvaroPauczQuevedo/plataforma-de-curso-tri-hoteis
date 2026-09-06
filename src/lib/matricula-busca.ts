/**
 * Contrato da busca de pessoas para a matrícula em massa.
 *
 * Mora fora de `actions/enrollments.ts` por uma regra do Next: arquivo marcado
 * com `"use server"` só pode exportar funções assíncronas — toda constante ou
 * tipo exportado de lá quebra o build. E o erro não aparece no `tsc` nem no
 * lint, só na compilação, que é onde ele me pegou.
 *
 * O tipo e o teto precisam ser vistos pelos dois lados: pela action que busca e
 * pelo componente que mostra o aviso de "há mais do que cabe aqui".
 */

/**
 * Quantas pessoas a busca devolve de uma vez.
 *
 * Existe um teto, e ele é MOSTRADO na tela quando é atingido. Sem isso,
 * "marcar os desta busca" marcaria as 50 primeiras enquanto quem clicou
 * acredita ter marcado as trezentas que a busca encontrou — e a matrícula
 * sairia incompleta sem ninguém perceber.
 */
export const LIMITE_DA_BUSCA = 50;

export type PessoaParaMatricula = {
  id: string;
  name: string;
  username: string;
  role: string;
  departamento: string | null;
};
