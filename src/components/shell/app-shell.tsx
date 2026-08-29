"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, User, X, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Casca da aplicação: menu lateral escuro, barra superior e barra inferior no
 * celular.
 *
 * A estrutura e as classes são as mesmas da intranet (ver globals.css) para
 * que os dois sistemas pareçam o mesmo produto. O funcionário sai da intranet,
 * clica em "Faculdade" e encontra a tela com a mesma cara — só o conteúdo muda.
 */

export interface ItemMenu {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Só marca como ativo em correspondência exata (usado na raiz). */
  exato?: boolean;
}

export interface GrupoMenu {
  titulo?: string;
  itens: ItemMenu[];
}

export function AppShell({
  grupos,
  menuCelular,
  subtitulo,
  rodape,
  usuario,
  children,
  acoesTopo,
}: {
  grupos: GrupoMenu[];
  menuCelular: ItemMenu[];
  subtitulo: string;
  rodape: string;
  usuario: { nome: string; avatarUrl?: string | null; perfilHref?: string };
  children: React.ReactNode;
  acoesTopo?: React.ReactNode;
}) {
  const caminho = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const refUsuario = useRef<HTMLDivElement>(null);

  // Navegar fecha a gaveta e o menu do usuário.
  useEffect(() => {
    setMenuAberto(false);
    setMenuUsuario(false);
  }, [caminho]);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (refUsuario.current && !refUsuario.current.contains(evento.target as Node)) {
        setMenuUsuario(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function ativo(item: ItemMenu) {
    return item.exato ? caminho === item.href : caminho.startsWith(item.href);
  }

  return (
    <div className="app">
      <div
        className={cn("sobreposicao", menuAberto && "visivel")}
        onClick={() => setMenuAberto(false)}
      />

      <aside className={cn("lateral", menuAberto && "aberta")} aria-label="Menu principal">
        <div className="lateral__marca">
          <Image
            src="/brand/logo-tri-hoteis.png"
            alt=""
            width={40}
            height={40}
            className="shrink-0 rounded-[11px] object-contain"
          />
          <div>
            <div className="lateral__nome">Tri Hotéis</div>
            <div className="lateral__sub">{subtitulo}</div>
          </div>
          <button
            type="button"
            className="lateral__fechar"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <nav className="lateral__nav">
          {grupos.map((grupo, indice) => (
            <div key={grupo.titulo ?? indice} className={indice > 0 ? "lateral__grupo" : ""}>
              {grupo.titulo && <div className="lateral__grupo-titulo">{grupo.titulo}</div>}
              {grupo.itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn("lateral__item", ativo(item) && "ativo")}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="lateral__rodape">{rodape}</div>
      </aside>

      <div className="conteudo">
        <header className="topo">
          <button
            type="button"
            className="icone-botao topo__menu"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="topo__acoes">
            {acoesTopo}
            <div className="relative" ref={refUsuario}>
              <button
                type="button"
                className="topo__usuario"
                onClick={() => setMenuUsuario((atual) => !atual)}
                aria-expanded={menuUsuario}
                aria-label="Menu do usuário"
              >
                <Avatar name={usuario.nome} src={usuario.avatarUrl} size="sm" />
                <span className="hidden text-sm font-medium text-ink-900 sm:inline">
                  {usuario.nome.split(" ")[0]}
                </span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {menuUsuario && (
                <div className="absolute right-0 top-[46px] z-40 w-56 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
                  <div className="border-b border-border px-4 py-3">
                    <div className="text-sm font-medium text-ink-900">{usuario.nome}</div>
                  </div>
                  {usuario.perfilHref && (
                    <Link
                      href={usuario.perfilHref}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-900 hover:bg-surface-muted"
                    >
                      <User className="h-4 w-4" />
                      Meu perfil
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger-600 hover:bg-surface-muted"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="principal" id="conteudo">
          {children}
        </main>
      </div>

      <nav className="barra-inferior" aria-label="Navegação principal">
        {menuCelular.map((item) => (
          <Link key={item.href} href={item.href} className={cn(ativo(item) && "ativo")}>
            <item.icon className="h-[21px] w-[21px]" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
