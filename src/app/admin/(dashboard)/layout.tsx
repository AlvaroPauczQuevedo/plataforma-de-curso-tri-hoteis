import { requireAdmin } from "@/lib/session";
import { AdminShell } from "@/components/admin/shell";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return <AdminShell adminName={admin.name ?? "Administrador"}>{children}</AdminShell>;
}
