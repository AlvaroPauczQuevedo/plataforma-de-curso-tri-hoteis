/**
 * Token do link de redefinição de senha: o link leva o token, o banco guarda
 * só o digest dele.
 *
 * Antes o token ia para o banco em texto puro. Quem tivesse uma cópia do banco
 * — e o `npm run backup` gera cópias, que circulam com menos cuidado do que o
 * arquivo em produção — podia abrir `/redefinir-senha/<token>` de qualquer
 * pedido ainda dentro da hora de validade e assumir aquela conta. O hash da
 * senha não permite isso; o token em claro permitia.
 *
 * SHA-256, e não bcrypt como a senha. A senha é escolhida por gente e por isso
 * é adivinhável, então precisa de um hash lento. O token tem 122 bits sorteados
 * pelo `randomUUID`, não há o que adivinhar, e um hash rápido basta. Ser rápido
 * também é o que deixa buscar o token pelo digest, com o índice único da coluna.
 *
 * Nenhuma migração foi necessária: a coluna continua `String @unique` e só
 * mudou o que vai dentro dela. Os links pendentes no momento da publicação
 * param de funcionar, porque o banco tem o token em claro e a busca agora é
 * pelo digest. Eles valiam uma hora, então o efeito passa sozinho.
 */
import { createHash, randomUUID } from "node:crypto";

/** O que o banco guarda para um token. */
export function digestDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Um token novo: `token` vai para o link e para o e-mail, `digest` vai para o
 * banco. Os dois saem juntos daqui para nenhum chamador gravar o errado.
 */
export function novoTokenDeRedefinicao(): { token: string; digest: string } {
  const token = randomUUID();
  return { token, digest: digestDoToken(token) };
}
