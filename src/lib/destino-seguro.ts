/**
 * Onde é seguro mandar alguém depois do login.
 *
 * O `callbackUrl` chega pela query da URL — `/login?callbackUrl=...` — e ia
 * direto para o `router.push`. Um link como `/login?callbackUrl=https://site-
 * falso` fazia a pessoa autenticar no site verdadeiro e, em seguida, ser jogada
 * no site do atacante, que imita um "sua sessão expirou, entre de novo" e colhe
 * a senha. É um redirecionamento aberto, e o alvo é sempre quem confia no
 * domínio real.
 *
 * A regra é só aceitar caminho INTERNO: uma barra, seguida de algo que não seja
 * outra barra nem contrabarra. Isso barra:
 *
 *   https://mau.example      (tem esquema)
 *   //mau.example            (protocol-relative: o navegador completa o esquema)
 *   /\mau.example            (alguns navegadores tratam \ como /)
 *   javascript:...           (não começa com /)
 *
 * O que não passa vira o destino padrão. Pura e sem import de propósito: roda
 * no componente de cliente do login, e qualquer dependência de servidor iria
 * parar no pacote do navegador.
 */
export function destinoSeguro(callbackUrl: string | undefined, padrao: string): string {
  if (!callbackUrl) return padrao;

  // Precisa ser caminho absoluto do próprio site: "/algo", nunca "//" ou "/\".
  if (!/^\/(?![/\\])/.test(callbackUrl)) return padrao;

  return callbackUrl;
}
