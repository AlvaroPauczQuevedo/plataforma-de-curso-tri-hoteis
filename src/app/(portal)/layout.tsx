import { requireUser } from "@/lib/session";
import { PortalNavbar } from "@/components/portal/navbar";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <PortalNavbar userName={user.name ?? "Funcionário"} avatarUrl={user.avatarUrl} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
