"use client";

import { Award, BookOpen, FileQuestion, History, Home, User } from "lucide-react";
import { AppShell, type GrupoMenu, type ItemMenu } from "@/components/shell/app-shell";

const GRUPOS: GrupoMenu[] = [
  {
    itens: [
      { href: "/", label: "Início", icon: Home, exato: true },
      { href: "/meus-cursos", label: "Meus cursos", icon: BookOpen },
      { href: "/provas", label: "Provas", icon: FileQuestion },
    ],
  },
  {
    titulo: "Meu histórico",
    itens: [
      { href: "/historico", label: "Aprendizagem", icon: History },
      { href: "/certificados", label: "Certificados", icon: Award },
      { href: "/perfil", label: "Meu perfil", icon: User },
    ],
  },
];

const CELULAR: ItemMenu[] = [
  { href: "/", label: "Início", icon: Home, exato: true },
  { href: "/meus-cursos", label: "Cursos", icon: BookOpen },
  { href: "/provas", label: "Provas", icon: FileQuestion },
  { href: "/perfil", label: "Perfil", icon: User },
];

/** Casca do portal do funcionário, com a mesma estrutura de tela da intranet. */
export function PortalShell({
  userName,
  avatarUrl,
  matricula,
  children,
}: {
  userName: string;
  avatarUrl?: string | null;
  matricula?: string | null;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      grupos={GRUPOS}
      menuCelular={CELULAR}
      subtitulo="Faculdade corporativa"
      rodape={matricula ? `Matrícula ${matricula}` : "Portal do funcionário"}
      usuario={{ nome: userName, avatarUrl, perfilHref: "/perfil" }}
    >
      {children}
    </AppShell>
  );
}
