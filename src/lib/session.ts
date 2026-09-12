import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { revalidarConta } from "@/lib/conta-vigente";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/*
  Estas três funções são a checagem SEGURA de acesso da plataforma.

  O proxy (`src/proxy.ts`) também olha o papel, mas só pelo cookie — é a
  checagem otimista que o guia de autenticação do Next recomenda para ele,
  porque roda em toda rota, inclusive nas pré-carregadas, e não deve ir ao
  banco. Ela serve para redirecionar cedo, não para proteger nada. Quem protege
  é o que está aqui, e aqui a conta é relida do banco a cada requisição:

  - `active`, para desativar valer na hora — sem isso a pessoa seguiria
    estudando por até 8 horas depois do desligamento;
  - `role`, para rebaixar valer na hora — sem isso um administrador rebaixado
    seguia com o painel inteiro nas mãos pelo mesmo intervalo.

  O efeito colateral no proxy é só de navegação: quem acabou de ser PROMOVIDO
  ainda é mandado para fora de /admin pelo cookie antigo, até entrar de novo.
  O inverso — o rebaixado passar pelo proxy — é barrado pelo layout do painel,
  que chama `requireAdmin`.
*/

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  const usuario = await revalidarConta(session.user);
  if (!usuario) {
    redirect("/login?erro=acesso-desativado");
  }
  return usuario;
}

export async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const usuario = await revalidarConta(session.user);
  if (!usuario) {
    redirect("/admin/login?erro=acesso-desativado");
  }

  // O papel do BANCO, não o do token. Ver `lib/conta-vigente`.
  if (usuario.role !== "ADMIN") {
    redirect("/");
  }
  return usuario;
}

/**
 * Sessão para rotas de API, já com a conta revalidada.
 *
 * As rotas de API não podem redirecionar como uma página: devolvem null e
 * quem chama responde 401. A mesma releitura do `requireUser` — sem ela, uma
 * conta desativada continuaria baixando vídeos e certificados pela API até o
 * token expirar, e um administrador rebaixado continuaria alcançando qualquer
 * arquivo do acervo por `/api/files`, que decide pelo `role` devolvido aqui.
 */
export async function sessaoDeApi() {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  return revalidarConta(session.user);
}
