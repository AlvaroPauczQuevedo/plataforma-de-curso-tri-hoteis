import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { AdminShell } from "@/components/admin/shell";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  /**
   * Senha provisória bloqueia o painel até a troca — a mesma regra que o portal
   * já aplicava. Sem isto, a senha temporária que um administrador recebe ao ser
   * cadastrado vale para sempre, e ninguém é obrigado a trocá-la.
   *
   * A verificação é aqui, no servidor, e não no middleware: o middleware só vê
   * o token da sessão, que não acompanha a troca de senha feita depois do login.
   */
  const conta = await db.user.findUnique({
    where: { id: admin.id },
    select: { mustChangePassword: true },
  });
  if (conta?.mustChangePassword) {
    redirect("/trocar-senha");
  }

  return <AdminShell adminName={admin.name ?? "Administrador"}>{children}</AdminShell>;
}
