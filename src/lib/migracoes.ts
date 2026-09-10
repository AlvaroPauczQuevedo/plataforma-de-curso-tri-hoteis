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
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
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

/*
  ---------------------------------------------------------------- a trava

  A migração precisa acontecer UMA vez, e este módulo roda na subida de CADA
  processo — a hospedagem sobe vários, que é a mesma descoberta que obrigou o
  relatório acima a morar em arquivo em vez de numa variável.

  Sem trava, dois processos que subam juntos executam a mesma migração ao mesmo
  tempo. Para `CREATE TABLE` e `ADD COLUMN` isso passa batido, porque
  `ehObjetoJaExistente` tolera o segundo. O estrago está na reescrita de tabela
  que o Prisma gera para SQLite — cria `new_User`, copia, DERRUBA a antiga,
  renomeia: o segundo processo chega para copiar de uma tabela que o primeiro
  acabou de derrubar, e aí não é mais "o objeto já existe", é dado perdido.

  A trava é um arquivo criado com "wx", que falha se ele já existe. A criação é
  atômica no sistema de arquivos, e isso basta: os processos são todos da mesma
  máquina, olhando para a mesma pasta. Não depende de transação do SQLite, que
  o cliente do Prisma não garante entregar na mesma conexão.
*/

/** Ao lado do relatório, e pelo mesmo motivo: é estado do servidor. */
const ARQUIVO_DA_TRAVA = path.resolve(ERROS_ROOT, "..", "migracao-em-curso.lock");

/**
 * Depois disto, a trava é considerada abandonada e pode ser assumida.
 *
 * Processo morto no meio da migração não remove a própria trava. Sem este
 * prazo, um único apagão deixaria o servidor sem nunca mais migrar — trocaria
 * uma falha rara por uma permanente.
 */
const TRAVA_ABANDONADA_MS = 10 * 60_000;

/**
 * Quanto o processo perdedor espera o vencedor terminar.
 *
 * Esperar é melhor do que seguir: quem segue serve requisição com o banco no
 * schema antigo, que é exatamente o apagão que este módulo existe para acabar.
 * Configurável porque o tempo certo depende do tamanho do banco, e aqui não há
 * terminal no servidor para descobrir isso de outro jeito.
 */
const ESPERA_MAXIMA_MS =
  Number(process.env.MIGRACAO_ESPERA_MINUTOS ?? 5) * 60_000;

const INTERVALO_DE_ESPERA_MS = 500;

const dormir = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));

function tentarTravar(): { travou: boolean; semTrava?: string } {
  try {
    mkdirSync(path.dirname(ARQUIVO_DA_TRAVA), { recursive: true });
    const descritor = openSync(ARQUIVO_DA_TRAVA, "wx");
    writeSync(descritor, `pid ${process.pid} em ${new Date().toISOString()}\n`);
    closeSync(descritor);
    return { travou: true };
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException)?.code === "EEXIST") return { travou: false };

    /*
      Não deu para criar a trava por outro motivo — pasta somente-leitura, por
      exemplo. Seguir SEM ela devolve o comportamento de antes desta trava
      existir, que é um risco conhecido e raro; recusar a migrar por causa
      disso reintroduziria a falha que derrubou o site quatro vezes.
    */
    return { travou: true, semTrava: (erro as Error)?.message ?? String(erro) };
  }
}

function destravar(): void {
  try {
    unlinkSync(ARQUIVO_DA_TRAVA);
  } catch {
    // Já removida por quem a considerou abandonada. Não há o que consertar.
  }
}

function idadeDaTrava(): number | null {
  try {
    return Date.now() - statSync(ARQUIVO_DA_TRAVA).mtimeMs;
  } catch {
    return null;
  }
}

type EstadoDaTrava = "assumida" | "sem-trava" | "desnecessaria" | "esgotou";

/** Pega a trava, ou espera quem a tem — o que vier primeiro. */
async function aguardarOuAssumirATrava(): Promise<{
  estado: EstadoDaTrava;
  aviso?: string;
}> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  let primeira = true;

  for (;;) {
    if (!primeira && Date.now() >= limite) return { estado: "esgotou" };
    primeira = false;

    const tentativa = tentarTravar();
    if (tentativa.travou) {
      return tentativa.semTrava
        ? { estado: "sem-trava", aviso: tentativa.semTrava }
        : { estado: "assumida" };
    }

    const idade = idadeDaTrava();
    if (idade !== null && idade > TRAVA_ABANDONADA_MS) {
      console.warn(
        `[migracao] trava parada há ${Math.round(idade / 60_000)} min — ` +
          "o processo que migrava não chegou ao fim. Assumindo o lugar dele."
      );
      destravar();
      continue;
    }

    /*
      Enquanto o outro trabalha, a única pergunta que importa é se ainda falta
      alguma coisa. Zerou, ele terminou, e não há mais o que esperar — nem por
      que disputar a trava.
    */
    try {
      if ((await migracoesPendentes()).length === 0) return { estado: "desnecessaria" };
    } catch {
      // Banco no meio de uma reescrita de tabela: seguir esperando.
    }

    await dormir(INTERVALO_DE_ESPERA_MS);
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

  /*
    Daqui para baixo há trabalho a fazer, e ele precisa acontecer uma vez só.
    A trava é pedida SÓ neste ponto: no caso normal — nada pendente — a subida
    não toca em arquivo nenhum, que é como era antes.
  */
  const trava = await aguardarOuAssumirATrava();

  if (trava.estado === "desnecessaria") {
    registrar({ quando, pendentesAntes: pendentes, aplicadas: [] });
    console.log("[migracao] outro processo aplicou as pendências; banco em dia.");
    return;
  }

  if (trava.estado === "esgotou") {
    const minutos = Math.round(ESPERA_MAXIMA_MS / 60_000);
    const erro = `outro processo está migrando há mais de ${minutos} min e não terminou`;
    registrar({ quando, pendentesAntes: pendentes, aplicadas: [], erro });
    console.error(
      `[migracao] ${erro}. Subindo com o banco desatualizado — as telas que ` +
        "dependem do schema novo vão falhar. MIGRACAO_ESPERA_MINUTOS aumenta a espera."
    );
    return;
  }

  if (trava.estado === "sem-trava") {
    console.warn(
      `[migracao] seguindo SEM trava entre processos (${trava.aviso}). ` +
        "Se a hospedagem subir mais de um processo, a migração pode acontecer duas vezes."
    );
  }

  try {
    /*
      Relê com a trava na mão. Entre a primeira leitura e a trava, quem estava
      na frente pode ter aplicado tudo — ou parte, e aí aplicar de novo o que
      já entrou é o desvio que este módulo passa o tempo todo reconciliando.
    */
    const restantes = await migracoesPendentes();

    if (restantes.length === 0) {
      registrar({ quando, pendentesAntes: pendentes, aplicadas: [] });
      console.log("[migracao] outro processo aplicou as pendências; banco em dia.");
      return;
    }

    await aplicarLista(pasta, restantes, quando);
  } catch (erro) {
    const mensagem = (erro as Error)?.message ?? String(erro);
    registrar({ quando, pendentesAntes: pendentes, aplicadas: [], erro: mensagem });
    console.error("[migracao] não foi possível reconferir o estado do banco:", mensagem);
  } finally {
    // Só devolve a trava quem a pegou: no caso "sem-trava" não há o que soltar,
    // e remover o arquivo seria puxar a trava de outro processo.
    if (trava.estado === "assumida") destravar();
  }
}

/** Aplica, em ordem, as migrações que a trava garantiu serem só nossas. */
async function aplicarLista(
  pasta: string,
  pendentes: string[],
  quando: string
): Promise<void> {
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
