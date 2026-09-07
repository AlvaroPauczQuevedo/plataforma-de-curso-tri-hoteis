"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import {
  CHAVE_DO_TEMA,
  lerEscolha,
  proximaEscolha,
  resolverTema,
  type TemaAplicado,
} from "@/lib/tema";

/**
 * Botão de tema claro / escuro na barra superior.
 *
 * Um clique, não um menu de três opções. "Sistema" continua existindo como
 * estado INICIAL — quem nunca clicou acompanha o aparelho —, mas quem clica
 * está dizendo o que quer ver agora, e transformar isso em três escolhas
 * empilhadas custaria mais atenção do que o assunto merece.
 *
 * O tema não mora em estado do React, e sim no atributo `data-theme` do
 * elemento raiz — escrito pelo script que roda antes da primeira pintura (ver
 * `scriptDeTema`). Este componente apenas LÊ dali e escreve de volta,
 * através de `useSyncExternalStore`, que é a ferramenta do React para estado
 * externo mutável. Guardar uma segunda cópia em `useState` criaria duas
 * fontes para a mesma verdade, e elas divergiriam na primeira renderização.
 */

const ouvintes = new Set<() => void>();

function lerGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_DO_TEMA);
  } catch {
    // Armazenamento bloqueado (janela anônima, política corporativa).
    return null;
  }
}

function aplicar(tema: TemaAplicado): void {
  document.documentElement.setAttribute("data-theme", tema);
  for (const ouvinte of ouvintes) ouvinte();
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);

  /*
    Enquanto a escolha for "sistema", o tema acompanha o aparelho EM TEMPO
    REAL. Sem isto, quem deixa o celular trocar sozinho ao anoitecer veria a
    plataforma continuar clara até recarregar a página.

    A condição é relida a cada evento, e não capturada agora: quem clicou no
    botão no meio da sessão deixou de seguir o sistema, e o ouvinte precisa
    saber disso sem ser recriado.
  */
  const consulta = window.matchMedia?.("(prefers-color-scheme: dark)");
  const aoMudarSistema = () => {
    if (lerEscolha(lerGuardado()) !== "sistema") return;
    aplicar(resolverTema("sistema", consulta!.matches));
  };
  consulta?.addEventListener("change", aoMudarSistema);

  return () => {
    ouvintes.delete(ouvinte);
    consulta?.removeEventListener("change", aoMudarSistema);
  };
}

/** O que está pintado agora, lido de onde a verdade mora. */
function instantaneo(): TemaAplicado {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/*
  No servidor não existe navegador, então não há tema a informar. Devolver
  "light" aqui faria o ícone aparecer errado por um instante para quem usa o
  escuro — o mesmo piscar que o script do layout existe para evitar.
*/
function instantaneoNoServidor(): null {
  return null;
}

export function SeletorDeTema() {
  const aplicado = useSyncExternalStore(inscrever, instantaneo, instantaneoNoServidor);

  function alternar() {
    if (!aplicado) return;

    const escolha = proximaEscolha(aplicado);
    // A escolha passou a ser explícita: a preferência do sistema não conta.
    aplicar(resolverTema(escolha, false));

    try {
      localStorage.setItem(CHAVE_DO_TEMA, escolha);
    } catch {
      // Sem poder guardar, o tema vale só nesta aba. Melhor que não alternar.
    }
  }

  /*
    Espaço reservado antes de o componente saber o tema, do tamanho exato do
    botão. Renderizar nada faria o resto da barra pular para a esquerda e
    voltar — e o pulo acontece justamente onde ficam os controles que a pessoa
    vai clicar.
  */
  if (!aplicado) {
    return <span className="icone-botao" aria-hidden="true" />;
  }

  const indoParaEscuro = aplicado === "light";

  return (
    <button
      type="button"
      onClick={alternar}
      className="icone-botao"
      /*
        O rótulo diz o que o clique FAZ, não o que está na tela. Quem usa
        leitor de tela não vê o ícone; ouvir "tema claro" não responde se
        aquilo é o estado atual ou o destino do botão.
      */
      aria-label={indoParaEscuro ? "Mudar para o tema escuro" : "Mudar para o tema claro"}
      title={indoParaEscuro ? "Tema escuro" : "Tema claro"}
    >
      {indoParaEscuro ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
