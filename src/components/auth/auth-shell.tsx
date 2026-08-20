import { Logo, LogoLockup } from "@/components/ui/logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  badge,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-brand-700 p-12 text-white lg:flex">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white,transparent_35%),radial-gradient(circle_at_80%_60%,white,transparent_30%)]" />
        <div className="relative flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="text-lg font-semibold">Academia Corporativa</p>
            <p className="text-sm text-white/70">Tri Hotéis</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <h1 className="text-3xl font-semibold leading-snug">
            Desenvolva sua equipe.
            <br />
            Eleve a experiência Tri Hotéis.
          </h1>
          <p className="max-w-md text-white/70">
            Cursos, treinamentos e trilhas de aprendizagem em um só lugar —
            simples de usar, disponível quando você precisar.
          </p>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Tri Hotéis. Todos os direitos reservados.
        </p>
      </div>

      <div className="flex items-center justify-center bg-surface-muted px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <LogoLockup size={40} />
          </div>

          <div className="space-y-2">
            {badge && (
              <span className="inline-block rounded-full bg-brand-700/10 px-2.5 py-1 text-xs font-medium text-brand-700">
                {badge}
              </span>
            )}
            <h2 className="text-2xl font-semibold text-ink-900">{title}</h2>
            <p className="text-sm text-ink-700/70">{subtitle}</p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">{children}</div>

          {footer}
        </div>
      </div>
    </div>
  );
}
