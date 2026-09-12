/**
 * O que a conta É agora, e não o que ela era quando o token foi emitido.
 *
 * A sessão é um JWT de 8 horas, e ele carrega o papel da pessoa no momento do
 * login. Só que o papel muda: `updateEmployee` rebaixa um administrador a
 * funcionário. Quem conferia o papel pelo token — `requireAdmin`, e através
 * dele TODA tela e toda server action do painel — deixava o rebaixado
 * cadastrando e excluindo gente, redefinindo senha e apagando curso por até
 * 8 horas depois de perder o cargo.
 *
 * A desativação já era relida a cada requisição; o papel não, e a assimetria
 * não tinha motivo. Pior: o caso realista de rebaixamento é justamente o de
 * quem CONTINUA na empresa e com a sessão aberta. Os PDFs de auditoria e de
 * prova já releem o papel por conta própria — alguém notou o problema, e a
 * correção ficou nas pontas em vez de ir para a raiz. Aqui é a raiz.
 *
 * Custo zero: a linha do usuário já era lida para conferir `active`, e agora a
 * mesma consulta traz o papel junto.
 *
 * Fica fora de `lib/session`, que depende do NextAuth e do roteamento do Next,
 * para a regra poder ser exercitada em teste sem subir framework nenhum — o
 * mesmo motivo de `permissoes-usuario` morar separado de `alcance-admin`.
 */
import { db } from "@/lib/db";

type UsuarioDoToken = { id: string; role: "ADMIN" | "EMPLOYEE" };

/**
 * O usuário do token com o papel corrigido pelo banco, ou `null` se a conta
 * não pode mais usar a plataforma (desativada ou apagada).
 *
 * O resto do token — nome, avatar — segue como veio: é exibição, e errar nele
 * por algumas horas não abre porta nenhuma. O papel e a situação são as duas
 * coisas que decidem acesso, e são as duas que saem do banco.
 */
export async function revalidarConta<T extends UsuarioDoToken>(
  usuario: T
): Promise<T | null> {
  const conta = await db.user.findUnique({
    where: { id: usuario.id },
    select: { active: true, role: true },
  });

  if (!conta?.active) return null;

  return { ...usuario, role: conta.role };
}
