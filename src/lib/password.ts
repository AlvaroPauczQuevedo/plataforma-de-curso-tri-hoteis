import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
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
