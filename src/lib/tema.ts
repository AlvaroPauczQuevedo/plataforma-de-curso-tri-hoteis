/**
 * Tema claro e escuro.
 *
 * A escolha vive no navegador, não no banco, e isso é decisão de produto: esta
 * é uma rede de hotéis onde o computador da recepção é compartilhado por três
 * turnos. Preferência de tema é da PESSOA no APARELHO em que ela está, não da
 * conta — salvar no perfil faria a escolha do turno da manhã seguir o crachá
 * de quem entra à noite, e viajar para o celular de casa junto.
 *
 * Também é o comportamento que todo mundo já conhece de outros sistemas.
 */

/** Onde a escolha fica guardada no navegador. */
export const CHAVE_DO_TEMA = "tri-tema";

/**
 * O que a pessoa escolheu — não o que está pintado na tela.
 *
 * "sistema" é o estado inicial e significa "siga o aparelho". Ele é diferente
 * de "claro": quem nunca escolheu acompanha o sistema operacional; quem
 * escolheu claro continua no claro mesmo que o celular vire para o escuro à
 * noite.
 */
export type EscolhaDeTema = "claro" | "escuro" | "sistema";

/** O que de fato vai para `data-theme` no elemento raiz, e o CSS entende. */
export type TemaAplicado = "light" | "dark";

export function ehEscolhaValida(valor: unknown): valor is EscolhaDeTema {
  return valor === "claro" || valor === "escuro" || valor === "sistema";
}

/**
 * Lê o que estava guardado, tolerando lixo.
 *
 * Volta para "sistema" diante de qualquer coisa inesperada — chave ausente,
 * valor de uma versão anterior, alguém que editou o armazenamento à mão. O
 * padrão seguro aqui é acompanhar o aparelho, não impor um tema.
 */
export function lerEscolha(bruto: string | null): EscolhaDeTema {
  return ehEscolhaValida(bruto) ? bruto : "sistema";
}

/** Traduz a escolha para o tema que a tela vai mostrar. */
export function resolverTema(
  escolha: EscolhaDeTema,
  sistemaPrefereEscuro: boolean
): TemaAplicado {
  if (escolha === "claro") return "light";
  if (escolha === "escuro") return "dark";
  return sistemaPrefereEscuro ? "dark" : "light";
}

/**
 * O que um clique no botão deve gravar.
 *
 * A partir de "sistema", o clique adota o OPOSTO do que está na tela — é o
 * único resultado que corresponde ao que a pessoa quis dizer. Se ela está
 * vendo claro e clica no botão de tema, ela quer escuro; gravar "escuro" às
 * cegas daria certo por acaso ali e erraria quando o sistema já estivesse no
 * escuro, deixando o clique sem efeito visível — o defeito mais irritante que
 * um botão pode ter.
 */
export function proximaEscolha(atual: TemaAplicado): EscolhaDeTema {
  return atual === "dark" ? "claro" : "escuro";
}

/**
 * O script que roda ANTES da primeira pintura.
 *
 * Sem ele a página nasce clara e pisca para o escuro depois que o JavaScript
 * do React assume — um flash branco na cara de quem escolheu escuro, em toda
 * navegação. Por isso ele é inline no `<head>`, síncrono, e minúsculo.
 *
 * É também quem resolve "sistema": estampa em `data-theme` já o resultado
 * final, "light" ou "dark". Assim o CSS precisa de um bloco de tema escuro só,
 * em vez de repetir a paleta inteira dentro de um `prefers-color-scheme`.
 *
 * Gerado aqui, e não escrito à mão no layout, para a chave de armazenamento
 * existir num lugar só. Duas cópias divergiriam e a escolha salva pararia de
 * ser lida, sem erro nenhum aparecendo.
 */
export function scriptDeTema(): string {
  return (
    "(function(){try{" +
    `var e=localStorage.getItem(${JSON.stringify(CHAVE_DO_TEMA)});` +
    "var s=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;" +
    "var t=e==='escuro'||(e!=='claro'&&s)?'dark':'light';" +
    "document.documentElement.setAttribute('data-theme',t);" +
    // Falhar aqui não pode derrubar a página: navegador com armazenamento
    // bloqueado (janela anônima, política corporativa) cai no tema claro.
    "}catch(x){document.documentElement.setAttribute('data-theme','light');}})()"
  );
}
