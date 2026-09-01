/**
 * O corpo da instrumentação, isolado num módulo próprio.
 *
 * A separação não é organização: é necessidade de build. `instrumentation.ts`
 * é compilado para OS DOIS runtimes quando existe middleware, e o de edge não
 * tem `node:fs` — o build quebrava antes de chegar a rodar. Mantendo o código
 * de sistema de arquivos aqui e importando este arquivo apenas dentro da
 * verificação de runtime, o empacotador do Next sabe deixá-lo de fora do
 * pacote de edge.
 *
 * Roda ao ser importado.
 */
import {
  digestDoTexto,
  gravarErro,
  limparErrosAntigos,
} from "@/lib/registro-de-erros";

await limparErrosAntigos();

const originalErro = console.error.bind(console);

console.error = (...args: unknown[]) => {
  originalErro(...args);

  try {
    const texto = args
      .map((a) =>
        a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a)
      )
      .join(" ");

    /*
      Linhas que começam com "[erro]" vêm do próprio monitoramento, que já
      gravou aquela ocorrência com contexto melhor do que o que daria para
      recuperar deste texto. Registrar de novo só duplicaria a tela.
    */
    if (texto.startsWith("[erro]")) return;

    const erro = args.find((a): a is Error => a instanceof Error);

    /*
      O digest é uma PROPRIEDADE do erro, não parte da mensagem nem da pilha.
      O Next o imprime porque o console formata as propriedades extras do
      objeto — mas quem lê só `message` e `stack` o perde, e o digest é
      exatamente o número que o usuário informa ao pedir ajuda. Sem ele, o
      registro não responde à única pergunta que o suporte recebe. Ler do
      texto continua valendo como reserva, para o caso de o erro chegar aqui
      já convertido em string.
    */
    const digest =
      (erro as (Error & { digest?: unknown }) | undefined)?.digest ??
      digestDoTexto(texto);

    void gravarErro({
      quando: new Date().toISOString(),
      contexto: "servidor",
      mensagem: (erro?.message ?? texto).slice(0, 2000),
      digest: digest === undefined ? undefined : String(digest),
      stack: (erro?.stack ?? texto).slice(0, 8000),
    });
  } catch {
    // Registrar o erro nunca pode virar um segundo erro.
  }
};

/*
  Falha fora do ciclo de requisição — uma promessa rejeitada sem tratamento,
  por exemplo — não passa pelo console do Next e derrubaria o processo em
  silêncio. Aqui ela pelo menos deixa rastro antes.
*/
process.on("unhandledRejection", (motivo) => {
  const e = motivo as Error;
  void gravarErro({
    quando: new Date().toISOString(),
    contexto: "promessa rejeitada sem tratamento",
    mensagem: e?.message ?? String(motivo),
    stack: e?.stack,
  });
});

process.on("uncaughtException", (erro) => {
  void gravarErro({
    quando: new Date().toISOString(),
    contexto: "exceção não capturada",
    mensagem: erro.message,
    stack: erro.stack,
  });
  originalErro("[fatal] exceção não capturada:", erro);
});
