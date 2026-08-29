import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/**
 * Confere, no banco, se a conta ainda pode usar a plataforma.
 *
 * A sessão é um token JWT com 8 horas de validade e não é consultável nem
 * revogável: desativar alguém no painel não alcançaria uma sessão já aberta,
 * e a pessoa seguiria estudando por até 8 horas depois do desligamento.
 * Por isso a situação é relida a cada requisição — o custo é uma consulta por
 * chave primária, e é o que torna a desativação imediata.
 */
async function contaValida(userId: string): Promise<boolean> {
  const conta = await db.user.findUnique({
    where: { id: userId },
    select: { active: true },
  });
  return conta?.active === true;
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (!(await contaValida(session.user.id))) {
    redirect("/login?erro=acesso-desativado");
  }
  return session.user;
}

export async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/admin/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }
  if (!(await contaValida(session.user.id))) {
    redirect("/admin/login?erro=acesso-desativado");
  }
  return session.user;
}

/**
 * Sessão para rotas de API, já com a conta revalidada.
 *
 * As rotas de API não podem redirecionar como uma página: devolvem null e
 * quem chama responde 401. Mesma releitura de `active` do requireUser — sem
 * ela, uma conta desativada continuaria baixando vídeos e certificados pela
 * API até o token expirar.
 */
export async function sessaoDeApi() {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  if (!(await contaValida(session.user.id))) return null;
  return session.user;
}
