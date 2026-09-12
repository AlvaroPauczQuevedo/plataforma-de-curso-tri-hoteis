import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/*
  Um hash de verdade contra o qual comparar quando a conta NÃO existe.

  O login só rodava o bcrypt quando encontrava a conta; para um usuário
  inexistente, respondia sem comparar hash nenhum. A diferença era medível — ~95
  ms contra ~22 ms num teste — e bastava para descobrir quais nomes de usuário
  existem sem acertar senha alguma, furando a mensagem genérica que o login usa
  justamente para não revelar isso.

  A defesa é fazer o caminho "não existe" gastar o MESMO trabalho: comparar a
  senha digitada contra este hash-isca. O resultado é ignorado — a comparação é
  só para o relógio.

  Calculado uma vez, sob demanda, e guardado. Ao custo 10, o mesmo de
  `hashPassword`, para os dois caminhos levarem o mesmo tempo. Não fica no topo
  do módulo porque `password` é importado até pelo `next build`, e um hash no
  carregamento gastaria ~90 ms em cada avaliação, algumas fora de um login. O
  conteúdo é descartável: só precisa ser um hash bcrypt válido do custo certo.
*/
let hashIscaCache: string | null = null;

export async function compararComHashIsca(plain: string): Promise<void> {
  if (!hashIscaCache) {
    hashIscaCache = await bcrypt.hash(`conta-inexistente-${randomUUID()}`, 10);
  }
  await bcrypt.compare(plain, hashIscaCache);
}

/**
 * Senha provisória: curta, fácil de ditar por telefone e sem caracteres
 * ambíguos (nada de O/0, I/1/l).
 *
 * Mora aqui, e não em cada chamador, porque já existiu em duas versões com
 * qualidades diferentes: esta, na sincronização com a intranet, e um
 * `randomUUID().slice(0, 10)` no cadastro de funcionário. A segunda rendia
 * cerca de 36 bits e ainda trazia um hífen no meio — exatamente onde quem lê
 * a senha em voz alta erra. Toda senha provisória dá acesso a uma conta, e não
 * é aceitável que a força dela dependa de qual tela a gerou.
 *
 * `randomInt` do node:crypto, e não `Math.random()`: a sequência do
 * Math.random é previsível a partir de alguns valores observados — quem
 * recebesse duas senhas conseguiria estimar as seguintes.
 */
export function senhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let saida = "";
  for (let i = 0; i < 8; i += 1) {
    saida += alfabeto[randomInt(alfabeto.length)];
  }
  return `Tri-${saida}`;
}
