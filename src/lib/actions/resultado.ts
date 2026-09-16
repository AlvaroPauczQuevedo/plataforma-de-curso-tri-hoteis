/**
 * O formato de retorno de toda server action da plataforma.
 *
 * Mora sozinho porque é um TIPO, e vivia dentro de `actions/employees` — um
 * arquivo `"use server"`, onde todo export vira um endereço alcançável de
 * fora. Tipo não vira endpoint (ele some na compilação), mas quatorze arquivos
 * importavam o formato de retorno de dentro do módulo de funcionários, o que
 * sugeria um parentesco que não existe: prova, documento e trilha não têm nada
 * a ver com cadastro de gente.
 *
 * `{ ok: false, error }` em vez de exceção porque o destino da mensagem é um
 * campo de formulário, não um log.
 */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
