/**
 * Resume o registro de erros em assinaturas distintas.
 *
 * Lê JSONL pela entrada padrão — o formato de `src/lib/registro-de-erros.ts` —
 * e imprime uma linha por tipo de erro, com a contagem, do mais frequente para
 * o menos.
 *
 * Nasceu de um problema concreto de diagnóstico: a verificação automática
 * acusou "15 erros fora do teste" durante a fumaça, e o log do GitHub Actions
 * só é legível por quem tem direitos de administração no repositório. Quem
 * investiga nem sempre tem. Com o resumo saindo como ANOTAÇÃO do build, a
 * informação fica visível na API pública da execução — e, principalmente, num
 * formato que cabe numa linha em vez de exigir rolar um log inteiro.
 *
 * Serve igual fora do CI:
 *
 *   cat storage/../erros/2026-09-02.jsonl | node scripts/resumir-erros.mjs
 *
 * `--anotacao` prefixa cada linha com `::warning::`, que é como o GitHub
 * Actions transforma a saída em anotação da execução.
 */

const comoAnotacao = process.argv.includes("--anotacao");
/** Teto de assinaturas distintas. Além disto vira ruído. */
const LIMITE = Number(process.env.RESUMO_LIMITE ?? 8);
/** Corte da mensagem: anotação longa é truncada pelo próprio GitHub. */
const TAMANHO_MENSAGEM = 140;

let entrada = "";
for await (const pedaco of process.stdin) entrada += pedaco;

const porAssinatura = new Map();

for (const linha of entrada.split("\n")) {
  if (!linha.trim()) continue;

  let chave;
  try {
    const erro = JSON.parse(linha);
    const mensagem = String(erro.mensagem ?? "").replace(/\s+/g, " ").trim();
    chave = `${erro.contexto ?? "sem contexto"} :: ${mensagem.slice(0, TAMANHO_MENSAGEM)}`;
  } catch {
    // Linha truncada por escrita interrompida: conta, mas não finge entender.
    chave = "linha ilegível no registro";
  }

  porAssinatura.set(chave, (porAssinatura.get(chave) ?? 0) + 1);
}

if (porAssinatura.size === 0) {
  console.log(comoAnotacao ? "" : "(nenhum erro registrado)");
  process.exit(0);
}

const ordenadas = [...porAssinatura.entries()].sort((a, b) => b[1] - a[1]);

for (const [assinatura, vezes] of ordenadas.slice(0, LIMITE)) {
  const texto = `${vezes}x ${assinatura}`;
  console.log(comoAnotacao ? `::warning::${texto}` : texto);
}

const restantes = ordenadas.length - LIMITE;
if (restantes > 0) {
  const texto = `... e mais ${restantes} assinatura(s) distinta(s)`;
  console.log(comoAnotacao ? `::warning::${texto}` : texto);
}
