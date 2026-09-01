/**
 * Ponto de entrada da instrumentação.
 *
 * Só decide o runtime. Todo o trabalho está em `instrumentation-node.ts`, e a
 * separação é exigência do empacotador: com middleware no projeto, o Next
 * compila este arquivo também para o runtime de edge, que não tem sistema de
 * arquivos. Importar o corpo dentro da verificação é o que mantém o código de
 * `node:fs` fora do pacote de edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
