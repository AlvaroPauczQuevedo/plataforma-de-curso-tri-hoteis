import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { scriptDeTema } from "@/lib/tema";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Academia Corporativa Tri Hotéis",
  description: "Plataforma de cursos e treinamentos corporativos Tri Hotéis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
      /*
        O script abaixo escreve `data-theme` no <html> antes do React assumir,
        então o que o servidor gerou e o que o navegador tem divergem de
        propósito. Sem isto o React reclama de hidratação em toda página.
      */
      suppressHydrationWarning
    >
      <head>
        {/*
          Roda ANTES da primeira pintura, e é por isso que está inline aqui em
          vez de num componente: um arquivo externo chegaria depois: a página
          nasceria clara e piscaria para o escuro. Um flash branco a cada
          navegação, exatamente na cara de quem escolheu o tema escuro.

          `dangerouslySetInnerHTML` é a forma de inserir script inline no App
          Router. O conteúdo é gerado por `scriptDeTema()`, sem nada vindo do
          usuário — a única parte variável é a chave de armazenamento, que é
          uma constante nossa passada por JSON.stringify.
        */}
        <script dangerouslySetInnerHTML={{ __html: scriptDeTema() }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
