"use client";

import {
  BarChart3,
  BookOpen,
  ClipboardList,
  History,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { AppShell, type GrupoMenu, type ItemMenu } from "@/components/shell/app-shell";

const GRUPOS: GrupoMenu[] = [
  {
    itens: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exato: true }],
  },
  {
    titulo: "Gestão de pessoas",
    itens: [
      { href: "/admin/funcionarios", label: "Usuários", icon: Users },
      { href: "/admin/matriculas", label: "Matrículas", icon: ClipboardList },
    ],
  },
  {
    titulo: "Conteúdo",
    itens: [{ href: "/admin/cursos", label: "Cursos", icon: BookOpen }],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
      { href: "/admin/atividades", label: "Atividades", icon: History },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const CELULAR: ItemMenu[] = [
  { href: "/admin", label: "Painel", icon: LayoutDashboard, exato: true },
  { href: "/admin/funcionarios", label: "Usuários", icon: Users },
  { href: "/admin/cursos", label: "Cursos", icon: BookOpen },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
];

/** Casca do painel administrativo, com a mesma estrutura de tela da intranet. */
export function AdminShell({
  children,
  adminName,
}: {
  children: React.ReactNode;
  adminName: string;
}) {
  return (
    <AppShell
      grupos={GRUPOS}
      menuCelular={CELULAR}
      subtitulo="Painel administrativo"
      rodape="Academia Corporativa"
      usuario={{ nome: adminName }}
    >
      {children}
    </AppShell>
  );
}
