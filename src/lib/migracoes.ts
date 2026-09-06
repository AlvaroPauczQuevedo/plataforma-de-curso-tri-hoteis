/**
 * Confere e aplica migrações pendentes NA SUBIDA DO SERVIDOR.
 *
 * Quatro apagões seguidos tiveram a mesma causa: código novo no ar com o banco
 * no schema antigo. O `prisma migrate deploy` não resolve nesta hospedagem —
 * ele bate em `database is locked` de forma sustentada, porque a aplicação
 * antiga ainda segura o arquivo do SQLite durante a publicação. Quem não
 * consegue o lock é o MOTOR de migração, um processo à parte; o cliente do
 * Prisma, que a aplicação usa o tempo todo, passa sem dificuldade.
 *
 * Então é por ele que aplicamos, aqui, no último instante antes de a primeira
 * requisição chegar.
 *
 * Tudo acontece DENTRO deste processo, e isso foi uma correção. A versão
 * anterior disparava `scripts/aplicar-migracoes.mjs` com `spawn`, o que era
 * apostar que a pasta `scripts/` e o `node_modules` completo estivessem no
 * servidor — duas coisas que eu nunca verifiquei e que a publicação não
 * garante. O que está comprovado é o que este módulo faz: `/api/saude` leu
 * `prisma/migrations` em produção e o cliente do Prisma escreve no banco a
 * cada requisição.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { db } from "@/lib/db";
import { ERROS_ROOT } from "@/lib/registro-de-erros";
import { checksumDe, comandosDe, ehObjetoJaExistente } from "@/lib/sql-de-migracao";

/*
  Caminho derivado de `process.cwd()`, que em `next start` é a raiz do projeto.
  Deliberadamente NÃO usamos `import.meta.url`: este módulo é empacotado pelo
  Next, e ali a URL aponta para o pedaço gerado dentro de `.next/`.
*/
const pastaDeMigracoes = () => path.join(process.cwd(), "prisma", "migrations");

/** O que aconteceu na última tentativa, para `/api/saude` poder contar. */
export type RelatorioDeMigracao = {
  quando: string;
  pendentesAntes: string[];
  aplicadas: string[];
  /*
    Comandos pulados por já existirem no banco. Vazio é o normal; cheio
    significa que havia desvio e ele foi reconciliado — dado que precisa
    ficar visível, não escondido num log que ninguém vai ler.
  */
  ignorados?: string[];
  erro?: string;
};

/*
  Em ARQUIVO, e não numa variável de módulo — a primeira versão usou variável e
  o campo saía sempre nulo em `/api/saude`. A instrumentação roda na subida e a
  rota responde em outro processo (a hospedagem sobe vários), então a memória de
  uma nunca é a da outra. Um campo eternamente nulo é pior que campo nenhum:
  parece informação e não é.

  Fica ao lado do registro de erros, não dentro dele — `limparErrosAntigos()`
  varre aquela pasta por idade e levaria este arquivo junto.
*/
const ARQUIVO_DO_RELATORIO = path.resolve(ERROS_ROOT, "..", "ultima-migracao.json");

function registrar(relatorio: RelatorioDeMigracao): void {
  try {
    mkdirSync(path.dirname(ARQUIVO_DO_RELATORIO), { recursive: true });
    writeFileSync(ARQUIVO_DO_RELATORIO, JSON.stringify(relatorio, null, 2), "utf8");
  } catch {
    // Registrar o diagnóstico nunca pode virar um segundo problema.
  }
}

/**
 * O que a última subida tentou fazer, e no que deu.
 *
 * Sem isto, diagnosticar exige o log do painel colado à mão, uma publicação por
 * vez — o vaivém que `/api/saude` veio encerrar. Nulo significa que nenhuma
 * subida chegou a registrar nada.
 */
export function ultimoRelatorioDeMigracao(): RelatorioDeMigracao | null {
  try {
    return JSON.parse(readFileSync(ARQUIVO_DO_RELATORIO, "utf8")) as RelatorioDeMigracao;
  } catch {
    return null;
  }
}

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
      primeiro arranque, e devolver a lista cheia é o que cria o schema do zero.
    */
  }

  return noRepositorio.filter((n) => !aplicadas.has(n)).sort();
}

/**
 * Aplica o que estiver pendente. Nunca lança, e NUNCA fica calada.
 *
 * O silêncio foi um defeito real: a primeira versão desta função devolvia cedo
 * e sem dizer nada quando não encontrava a pasta de migrações, o que é
 * indistinguível de "está tudo em dia". Publicamos com o login quebrado, fomos
 * ler o log da hospedagem e não havia uma linha para ler. Por isso toda saída
 * daqui escreve uma linha, inclusive o caso bom.
 */
export async function aplicarMigracoesNaSubida(): Promise<void> {
  const quando = new Date().toISOString();
  const pasta = pastaDeMigracoes();

  if (!existsSync(pasta)) {
    const erro = `pasta de migrações não encontrada em ${pasta} (cwd=${process.cwd()})`;
    registrar({ quando, pendentesAntes: [], aplicadas: [], erro });
    console.error(
      `[migracao] ${erro}. Não dá para conferir o schema na subida — ` +
        "se houver migração pendente, as telas que dependem dela vão falhar."
    );
    return;
  }

  let pendentes: string[];
  try {
    pendentes = await migracoesPendentes();
  } catch (erro) {
    const mensagem = (erro as Error)?.message ?? String(erro);
    registrar({ quando, pendentesAntes: [], aplicadas: [], erro: mensagem });
    console.error("[migracao] não foi possível conferir o estado do banco:", mensagem);
    return;
  }

  if (pendentes.length === 0) {
    registrar({ quando, pendentesAntes: [], aplicadas: [] });
    console.log("[migracao] banco em dia, nada pendente.");
    return;
  }

  console.log(
    `[migracao] ${pendentes.length} migração(ões) pendente(s) na subida: ` +
      `${pendentes.join(", ")}. Aplicando...`
  );

  const aplicadas: string[] = [];
  const ignorados: string[] = [];

  for (const nome of pendentes) {
    try {
      const arquivo = path.join(pasta, nome, "migration.sql");
      const conteudo = readFileSync(arquivo, "utf8");
      const comandos = comandosDe(conteudo);

      for (const comando of comandos) {
        try {
          await db.$executeRawUnsafe(comando);
        } catch (falha) {
          const texto = (falha as Error)?.message ?? String(falha);

          /*
            Só "o objeto já existe" é tolerado, e isso reconcilia o banco em
            desvio — schema que já tem parte da migração sem ela constar como
            aplicada. Qualquer outro erro sobe e interrompe.
          */
          if (!ehObjetoJaExistente(texto)) throw falha;

          const resumo = comando.split("\n")[0].slice(0, 80);
          ignorados.push(`${nome}: ${resumo}`);
          console.warn(`[migracao] ${nome}: já existia, seguindo — ${resumo}`);
        }
      }

      /*
        A linha de controle vai DEPOIS dos comandos, e só se todos passaram.
        Registrar antes deixaria uma migração pela metade marcada como
        concluída — pior do que não aplicada, porque ninguém volta a tentar.
      */
      await db.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
         VALUES (?,?,current_timestamp,?,NULL,NULL,current_timestamp,?)`,
        randomUUID(),
        checksumDe(conteudo),
        nome,
        comandos.length
      );

      aplicadas.push(nome);
      console.log(`[migracao] aplicada ${nome} (${comandos.length} comando(s)).`);
    } catch (erro) {
      /*
        Para na primeira que falhar, em vez de seguir para a próxima: as
        migrações são uma sequência, e aplicar a seguinte por cima de uma que
        não completou produz um schema que ninguém sabe descrever.
      */
      const mensagem = (erro as Error)?.message ?? String(erro);
      registrar({ quando, pendentesAntes: pendentes, aplicadas, ignorados, erro: `${nome}: ${mensagem}` });
      console.error(
        `[migracao] FALHOU em ${nome}: ${mensagem}. ` +
          `${aplicadas.length} aplicada(s) antes dela. ` +
          "O site vai apresentar erro nas telas que dependem do schema novo."
      );
      return;
    }
  }

  registrar({ quando, pendentesAntes: pendentes, aplicadas, ignorados });
  console.log(`[migracao] banco em dia — ${aplicadas.length} migração(ões) aplicada(s).`);
}
