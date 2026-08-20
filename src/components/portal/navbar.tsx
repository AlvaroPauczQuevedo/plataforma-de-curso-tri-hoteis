"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  GraduationCap,
  Home,
  BookOpen,
  History,
  Award,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Início", icon: Home },
  { href: "/meus-cursos", label: "Meus cursos", icon: BookOpen },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/certificados", label: "Certificados", icon: Award },
];

export function PortalNavbar({
  userName,
  avatarUrl,
}: {
  userName: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-navy-900 to-accent-600">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-navy-900">Academia Corporativa</p>
              <p className="text-[11px] text-navy-700/60">Tri Hotéis</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent-600/10 text-accent-600"
                      : "text-navy-700 hover:bg-surface-muted"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/perfil"
            className="hidden items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted sm:flex"
          >
            <Avatar name={userName} src={avatarUrl} size="sm" />
            <span className="text-sm font-medium text-navy-900">{userName.split(" ")[0]}</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-navy-700 hover:bg-surface-muted sm:flex"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
          <button
            className="rounded-lg p-2 text-navy-700 hover:bg-surface-muted md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border bg-white px-4 py-3 md:hidden animate-fade-in">
          <div className="flex flex-col gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                    active ? "bg-accent-600/10 text-accent-600" : "text-navy-700"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/perfil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-700"
            >
              <User className="h-4 w-4" />
              Perfil
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger-600"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
