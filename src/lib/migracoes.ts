/**
 * Confere e aplica migrações pendentes NA SUBIDA DO SERVIDOR.
 *
 * Por que aqui, se `scripts/pos-instalacao.mjs` já migra na instalação:
 *
 * Porque a instalação falhou em nos proteger quatro vezes, sempre do mesmo
 * jeito — código novo no ar, banco no schema antigo. O passo de migração de lá
 * depende de duas coisas que esta hospedagem não garante:
 *
 *  1. `NODE_ENV=production` definida durante o `npm install`. Se não estiver
 *     (e MIGRAR_NA_INSTALACAO também não), o bloco inteiro é pulado em
 *     silêncio, sem sequer tentar.
 *  2. O motor de migração conseguir o arquivo do banco. Ele não consegue: a
 *     aplicação antiga ainda está no ar segurando o SQLite, e o
 *     `migrate deploy` bate em `database is locked` de forma sustentada.
 *
 * A subida não depende de nenhuma das duas. Ela roda no processo que vai
 * servir as requisições, com o repositório inteiro em disco (este projeto não
 * usa `output: "standalone"`), e usa o CLIENTE do Prisma — que passa por onde o
 * motor tropeça, porque quem perde o lock é o motor, não o banco.
 *
 * E, principalmente: é o último instante em que dá para corrigir o schema
 * ANTES de a primeira requisição chegar. Migração que não aconteceu aqui vira
 * erro na cara do usuário.
 *
 * O custo de errar para cada lado não é simétrico, e é isso que decide o
 * desenho: migrar à toa não faz nada (a conferência é uma consulta), e não
 * migrar derruba o site inteiro. Em 2026-09-06 derrubou o LOGIN — a coluna
 * `User.unidadeId` não existia e nenhuma pessoa conseguia entrar.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { db } from "@/lib/db";

/** Caminhos derivados de `process.cwd()`, que em `next start` é a raiz do projeto. */
const pastaDeMigracoes = () => path.join(process.cwd(), "prisma", "migrations");
const aplicador = () => path.join(process.cwd(), "scripts", "aplicar-migracoes.mjs");

/**
 * Migrações do repositório que ainda não constam como aplicadas.
 *
 * Pergunta pelo cliente, com SQL cru: `_prisma_migrations` não está no schema
 * do Prisma, e o cru também é imune a qualquer coluna nova que ainda falte —
 * justamente o estado que estamos aqui para consertar. Consultar por um modelo
 * gerado daria erro exatamente quando a resposta importa.
 */
export async function migracoesPendentes(): Promise<string[]> {
  const pasta = pastaDeMigracoes();
  if (!existsSync(pasta)) return [];

  const noRepositorio = readdirSync(pasta, { withFileTypes: true })
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
      caso do primeiro arranque, e devolver a lista cheia é o que faz o
      aplicador criar o schema do zero.
    */
  }

  return noRepositorio.filter((n) => !aplicadas.has(n)).sort();
}

/**
 * Aplica o que estiver pendente, em processo separado.
 *
 * Separado de propósito, por duas razões. A primeira é isolamento: uma falha
 * ali dentro não pode derrubar a subida do servidor — trocar "uma tela com
 * erro" por "site fora do ar" seria péssimo negócio, e é a mesma escolha que
 * `pos-instalacao.mjs` faz. A segunda é que assim existe UMA implementação de
 * como aplicar uma migração à mão, e não duas que divergem com o tempo.
 *
 * Nunca lança. O pior caso é o de hoje — o schema fica velho e as telas
 * quebram —, e nesse caso o log diz exatamente o que fazer.
 */
export async function aplicarMigracoesNaSubida(): Promise<void> {
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

  // O caso normal, e o barato: uma consulta e um readdir, nada mais.
  if (pendentes.length === 0) return;

  const script = aplicador();
  if (!existsSync(script)) {
    console.error(
      `[migracao] ${pendentes.length} migração(ões) pendente(s) e o aplicador ` +
        `não está em ${script}. Telas que dependem do schema novo vão falhar.`
    );
    return;
  }

  console.log(
    `[migracao] ${pendentes.length} migração(ões) pendente(s) na subida: ` +
      `${pendentes.join(", ")}. Aplicando...`
  );

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
