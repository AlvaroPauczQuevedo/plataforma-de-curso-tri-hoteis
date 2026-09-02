/**
 * Aponta o registro de erros para uma pasta temporária.
 *
 * **Importe este módulo ANTES** de qualquer um que grave erro. `ERROS_ROOT` é
 * resolvido no momento em que `src/lib/registro-de-erros` é carregado, então
 * definir a variável depois não tem efeito — é o mesmo motivo e o mesmo
 * cuidado que `tests/ambiente.ts` toma com o `DATABASE_URL`.
 *
 * O que isto evita: `registrarErro` grava em disco de verdade, e sem o desvio
 * cada execução da suíte despejava erros inventados — "coluna X não existe",
 * "timeout no banco" — dentro do registro real da plataforma, que é o que a
 * tela `/admin/erros` lê. Foram 225 linhas de lixo acumuladas antes de alguém
 * reparar, e o efeito é o pior possível: quem abrisse aquela tela para
 * investigar uma falha de verdade encontraria falhas fabricadas junto, sem
 * nada indicando quais eram quais.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const PASTA_DE_ERROS = mkdtempSync(path.join(tmpdir(), "academia-erros-"));

process.env.ERROS_DIR = PASTA_DE_ERROS;

/** Faxina do fim da suíte. Nunca lança: é limpeza, não asserção. */
export function limparPastaDeErros() {
  try {
    rmSync(PASTA_DE_ERROS, { recursive: true, force: true });
  } catch {
    // Pasta temporária do sistema: falhar aqui não invalida teste nenhum.
  }
}
