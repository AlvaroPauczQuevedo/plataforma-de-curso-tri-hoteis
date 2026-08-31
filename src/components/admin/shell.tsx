"use client";

import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileQuestion,
  History,
  ShieldCheck,
  KeyRound,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { AppShell, type GrupoMenu, type ItemMenu } from "@/components/shell/app-shell";

/**
 * Menu do painel, montado conforme o alcance de quem está logado.
 *
 * Relatórios, Atividades e Configurações são da conta proprietária. Os dois
 * primeiros mostram a plataforma inteira — progresso e histórico de ação de
 * todos os departamentos —, e o terceiro decide a estrutura que governa o
 * alcance de todo mundo. Nenhum deles faz sentido para quem responde por um
 * setor só.
 *
 * O item some do menu E a página recusa no servidor. As duas coisas: esconder
 * sem barrar deixaria a URL aberta, e barrar sem esconder ofereceria um caminho
 * que termina em erro.
 */
function menuDe(proprietario: boolean): GrupoMenu[] {
  const administracao: ItemMenu[] = [
    ...(proprietario ? [{ href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 }] : []),
    { href: "/admin/conformidade", label: "Conformidade", icon: ShieldCheck },
    ...(proprietario
      ? [
          { href: "/admin/atividades", label: "Atividades", icon: History },
          { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
        ]
      : []),
    // Trocar a própria senha vive no portal, em /perfil. Sem este item, o
    // administrador não tem caminho nenhum até lá pela interface.
    { href: "/perfil", label: "Minha conta", icon: KeyRound },
  ];

  return [
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
      itens: [
        { href: "/admin/cursos", label: "Cursos", icon: BookOpen },
        { href: "/admin/provas", label: "Provas", icon: FileQuestion },
      ],
    },
    {
      titulo: "Administração",
      itens: administracao,
    },
  ];
}

/** A barra do celular cabe quatro itens; o quarto muda conforme o alcance. */
function menuCelularDe(proprietario: boolean): ItemMenu[] {
  return [
    { href: "/admin", label: "Painel", icon: LayoutDashboard, exato: true },
    { href: "/admin/funcionarios", label: "Usuários", icon: Users },
    { href: "/admin/cursos", label: "Cursos", icon: BookOpen },
    proprietario
      ? { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 }
      : { href: "/admin/matriculas", label: "Matrículas", icon: ClipboardList },
  ];
}

/** Casca do painel administrativo, com a mesma estrutura de tela da intranet. */
export function AdminShell({
  children,
  adminName,
  proprietario,
}: {
  children: React.ReactNode;
  adminName: string;
  proprietario: boolean;
}) {
  return (
    <AppShell
      grupos={menuDe(proprietario)}
      menuCelular={menuCelularDe(proprietario)}
      subtitulo="Painel administrativo"
      rodape="Academia Corporativa"
      usuario={{ nome: adminName }}
    >
      {children}
    </AppShell>
  );
}
