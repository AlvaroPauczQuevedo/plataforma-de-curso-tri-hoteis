import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PortalShell } from "@/components/portal/portal-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const conta = await db.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true, matricula: true },
  });

  /**
   * Senha provisória vigente bloqueia o portal inteiro até a troca. A
   * verificação é aqui, no servidor, e não no proxy: o proxy só
   * enxerga o token da sessão, que não acompanha a troca de senha feita
   * depois do login.
   */
  if (conta?.mustChangePassword) {
    redirect("/trocar-senha");
  }

  return (
    <PortalShell
      userName={user.name ?? "Funcionário"}
      avatarUrl={user.avatarUrl}
      matricula={conta?.matricula}
    >
      {children}
    </PortalShell>
  );
}
