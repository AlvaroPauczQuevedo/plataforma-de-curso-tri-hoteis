"use client";

import dynamic from "next/dynamic";

/**
 * Os gráficos do painel, carregados só depois que a tela aparece.
 *
 * O recharts custa 392 KB de JavaScript e é usado em UM lugar: o painel
 * inicial do administrador — que é exatamente a tela onde a pessoa cai logo
 * depois de entrar. O efeito era o login parecer lento: a autenticação em si
 * leva cerca de 130 ms, mas a tela seguinte só ficava utilizável depois de
 * baixar e interpretar a biblioteca inteira.
 *
 * Medido: a rota `/admin` era a única a puxar esse pacote; `/admin/funcionarios`
 * e `/login` não o carregam.
 *
 * Com o carregamento adiado, o painel pinta os números na hora — que é o que
 * quem entra vem ver — e os gráficos entram em seguida, no lugar reservado
 * para eles.
 *
 * `ssr: false` porque gráfico desenhado no servidor não adianta nada aqui: o
 * recharts mede o contêiner para se dimensionar, então o HTML do servidor
 * viria com tamanho errado e seria redesenhado no navegador de qualquer jeito.
 * E isto precisa ser um componente de CLIENTE: `ssr: false` não é permitido
 * dentro de um componente de servidor, que é o caso da página do painel.
 */

/**
 * O espaço que o gráfico vai ocupar, com a mesma altura dele.
 *
 * Sem reservar a altura, o conteúdo abaixo pularia quando o gráfico chegasse —
 * e o painel tem duas colunas de conteúdo logo em seguida.
 */
function Reservado() {
  return (
    <div className="flex h-56 items-center justify-center text-sm text-ink-700/40">
      Carregando gráfico...
    </div>
  );
}

export const StatusPieChart = dynamic(
  () => import("@/components/admin/charts").then((m) => m.StatusPieChart),
  { ssr: false, loading: Reservado }
);

export const DepartmentBarChart = dynamic(
  () => import("@/components/admin/charts").then((m) => m.DepartmentBarChart),
  { ssr: false, loading: Reservado }
);
