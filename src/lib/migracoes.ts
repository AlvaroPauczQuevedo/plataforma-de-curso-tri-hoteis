/**
 * Confere e aplica migrações pendentes NA SUBIDA DO SERVIDOR.
 *
 * Por que existe, se `scripts/pos-instalacao.mjs` já migra na instalação:
 * porque a instalação falhou em nos proteger quatro vezes, sempre igual —
 * código novo no ar, banco no schema antigo. Aqui é o último instante em que
 * dá para corrigir o schema ANTES de a primeira requisição chegar.
 *
 * O custo de errar não é simétrico, e é isso que decide o desenho: conferir à
 * toa custa uma consulta, e não conferir derruba o site. Em 2026-09-06 derrubou
 * o LOGIN — `User.unidadeId` não existia e ninguém entrava.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { db } from "@/lib/db";

/*
  Caminhos derivados de `process.cwd()`, que em `next start` é a raiz do
  projeto. Deliberadamente NÃO usamos `import.meta.url`: este módulo é
  empacotado pelo Next, e ali a URL aponta para o pedaço gerado dentro de
  `.next/`, não para o arquivo do repositório.
*/
const pastaDeMigracoes = () => path.join(process.cwd(), "prisma", "migrations");
const aplicador = () => path.join(process.cwd(), "scripts", "aplicar-migracoes.mjs");

/**
 * Migrações do repositório que ainda não constam como aplicadas.
 *
 * Consulta com SQL cru: `_prisma_migrations` não está no schema do Prisma, e o
 * cru também é imune a qualquer coluna nova que ainda falte — que é exatamente
 * o estado que estamos aqui para consertar. Perguntar por um modelo gerado
 * falharia justo quando a resposta importa.
 */
export async function migracoesPendentes(): Promise<string[]> {
  const noRepositorio = readdirSync(pastaDeMigracoes(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d/.test(d.name))
    .map((d) => d.name);

  let aplicadas = new Set<string>();
  try {
    const linhas = await db.$queryRawUnsafe<{ migration_name: string }[]>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    aplicadas = new Set(linhas.map((l) => l.migration_name));
  } catch {
    /*
      Sem a tabela de controle, o banco nunca migrou: tudo está pendente. É o
      primeiro arranque, e devolver a lista cheia é o que faz o aplicador criar
      o schema do zero.
    */
  }

  return noRepositorio.filter((n) => !aplicadas.has(n)).sort();
}

/**
 * Aplica o que estiver pendente. Nunca lança, e NUNCA fica calada.
 *
 * O silêncio foi um defeito real, não uma economia de log: a primeira versão
 * desta função devolvia cedo e sem dizer nada quando não encontrava a pasta de
 * migrações, o que é indistinguível de "está tudo em dia". Publicamos com o
 * login quebrado, lemos o log da hospedagem e não havia uma linha sequer para
 * ler — o conserto tinha rodado e se calado.
 *
 * Por isso toda saída daqui escreve uma linha, inclusive o caso bom. Uma linha
 * por subida é barata; um log mudo custou uma publicação inteira às cegas.
 */
export async function aplicarMigracoesNaSubida(): Promise<void> {
  const pasta = pastaDeMigracoes();

  if (!existsSync(pasta)) {
    console.error(
      `[migracao] pasta de migrações não encontrada em ${pasta} ` +
        `(cwd=${process.cwd()}). Não dá para conferir o schema na subida — ` +
        "se houver migração pendente, as telas que dependem dela vão falhar."
    );
    return;
  }

  let pendentes: string[];
  try {
    pendentes = await migracoesPendentes();
  } catch (erro) {
    console.error(
      "[migracao] não foi possível conferir o estado do banco:",
      (erro as Error)?.message
    );
    return;
  }

  if (pendentes.length === 0) {
    console.log("[migracao] banco em dia, nada pendente.");
    return;
  }

  const script = aplicador();
  if (!existsSync(script)) {
    console.error(
      `[migracao] ${pendentes.length} migração(ões) pendente(s) — ` +
        `${pendentes.join(", ")} — e o aplicador não está em ${script}. ` +
        "As telas que dependem do schema novo vão falhar."
    );
    return;
  }

  console.log(
    `[migracao] ${pendentes.length} migração(ões) pendente(s) na subida: ` +
      `${pendentes.join(", ")}. Aplicando...`
  );

  /*
    Em processo separado, por isolamento: uma falha ali dentro não pode
    derrubar a subida do servidor — trocar "uma tela com erro" por "site fora
    do ar" seria péssimo negócio. E assim existe UMA implementação de como
    aplicar migração à mão, em vez de duas que divergem com o tempo.
  */
  const codigo = await new Promise<number>((resolve) => {
    const filho = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
    });
    filho.on("error", (erro) => {
      console.error("[migracao] não foi possível executar o aplicador:", erro.message);
      resolve(1);
    });
    filho.on("close", (status) => resolve(status ?? 1));
  });

  /*
    Confere pelo banco em vez de confiar no código de saída: o que importa não
    é o script ter terminado bem, é o schema estar certo. Só a segunda pergunta
    responde se a próxima requisição vai funcionar.
  */
  const aindaFaltam = await migracoesPendentes().catch(() => null);

  if (aindaFaltam && aindaFaltam.length === 0) {
    console.log("[migracao] banco em dia.");
    return;
  }

  console.error(
    `[migracao] AS MIGRAÇÕES CONTINUAM PENDENTES (aplicador saiu com ${codigo}): ` +
      `${(aindaFaltam ?? pendentes).join(", ")}. ` +
      "O site vai apresentar erro nas telas que dependem do schema novo."
  );
}
