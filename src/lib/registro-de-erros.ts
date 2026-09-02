/**
 * Onde os erros de produção ficam guardados para serem lidos sem SSH.
 *
 * O monitoramento já avisava por e-mail e webhook, e escrevia em
 * `console.error`. Mas em produção o `stderr` da hospedagem chegou vazio: o
 * rastro do erro simplesmente não existia em lugar nenhum alcançável. Dois
 * diagnósticos desta semana travaram nisso — o usuário via "Código para o
 * suporte: 2268569496" e ninguém conseguia descobrir a que erro aquele código
 * correspondia.
 *
 * Então o arquivo aqui é o registro que a plataforma controla, e a tela
 * `/admin/erros` é a janela para ele.
 *
 * Três decisões:
 *
 *  - **Uma linha JSON por erro** (JSONL). Acrescentar é uma escrita só, não
 *    corrompe o arquivo se o processo morrer no meio, e continua legível por
 *    `cat` no dia em que houver SSH.
 *  - **Fora da pasta publicada**, junto dos uploads. Publicar substitui a
 *    aplicação; o histórico de erro precisa sobreviver ao deploy — é
 *    justamente depois de publicar que se quer olhar.
 *  - **Nunca lança.** Vale para todo este módulo: se registrar o erro falhar,
 *    quem perde é o diagnóstico, não a requisição do usuário.
 */
import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

/** Quantos dias de erro ficam guardados. */
const DIAS_MANTIDOS = Number(process.env.ERROS_DIAS ?? 30);

/*
  O `turbopackIgnore` abaixo é deliberado.

  O Turbopack avisa que um caminho montado em tempo de execução obriga a
  rastrear o projeto inteiro para o pacote de produção — e ele está certo sobre
  o mecanismo. Mas aqui o caminho é configurável DE PROPÓSITO: em produção ele
  aponta para fora da pasta da aplicação, porque publicar substitui essa pasta
  e levaria embora os arquivos junto. Prendê-lo a uma subpasta estática, que é
  a outra saída sugerida, desfaria justamente o que ele existe para permitir.
*/
export const ERROS_ROOT = path.resolve(
  process.env.ERROS_DIR ||
    path.join(
      /* turbopackIgnore: true */
      process.env.STORAGE_DIR ||
        path.join(/* turbopackIgnore: true */ process.cwd(), "storage"),
      "..",
      "erros"
    )
);

export type ErroRegistrado = {
  quando: string;
  contexto: string;
  mensagem: string;
  /** O mesmo código que a tela mostra ao usuário, quando dá para saber. */
  digest?: string;
  stack?: string;
};

function arquivoDoDia(data = new Date()) {
  return path.join(ERROS_ROOT, `${data.toISOString().slice(0, 10)}.jsonl`);
}

/**
 * O digest que o Next mostra ao usuário, extraído do texto do erro.
 *
 * É o fio que liga o código na tela ao rastro aqui. Sem ele, o suporte recebe
 * um número e não tem o que fazer com ele.
 */
export function digestDoTexto(texto: string): string | undefined {
  return texto.match(/digest[":\s]+['"]?(\d{6,})/i)?.[1];
}

/**
 * Quando a poda rodou pela última vez nesta instância.
 *
 * A limpeza só acontecia na subida do processo, apesar de a documentação
 * dizer "chamado ao gravar". Num servidor que fica semanas de pé, isso
 * significa poda nenhuma: os arquivos passavam da janela e ficavam. Aqui ela
 * volta a acontecer ao gravar, no máximo uma vez por dia — barato, e sem
 * exigir tarefa agendada.
 */
let ultimaPoda = 0;
const INTERVALO_DE_PODA_MS = 24 * 3_600_000;

export async function gravarErro(entrada: ErroRegistrado): Promise<void> {
  try {
    await mkdir(ERROS_ROOT, { recursive: true });
    await appendFile(arquivoDoDia(), JSON.stringify(entrada) + "\n", "utf8");
  } catch {
    // Sem lugar para gravar, resta o console — e não vale derrubar nada.
  }

  // Depois de gravar, e sem esperar: a poda é manutenção, não faz parte da
  // resposta, e já engole os próprios erros.
  if (Date.now() - ultimaPoda > INTERVALO_DE_PODA_MS) {
    ultimaPoda = Date.now();
    void limparErrosAntigos();
  }
}

/**
 * Os erros mais recentes, do mais novo para o mais antigo.
 *
 * Lê apenas os arquivos necessários para juntar `limite` linhas, começando
 * pelo dia mais recente: com trinta dias guardados, abrir a tela não pode
 * significar ler trinta arquivos.
 */
export async function lerErrosRecentes(limite = 100): Promise<ErroRegistrado[]> {
  try {
    const dias = (await readdir(/* turbopackIgnore: true */ ERROS_ROOT))
      .filter((n) => n.endsWith(".jsonl"))
      .sort()
      .reverse();

    const erros: ErroRegistrado[] = [];

    for (const dia of dias) {
      const conteudo = await readFile(path.join(ERROS_ROOT, dia), "utf8");

      for (const linha of conteudo.split("\n").reverse()) {
        if (!linha.trim()) continue;
        try {
          erros.push(JSON.parse(linha) as ErroRegistrado);
        } catch {
          // Linha truncada por escrita interrompida: ignora e segue.
        }
        if (erros.length >= limite) return erros;
      }
    }

    return erros;
  } catch {
    return [];
  }
}

/** Apaga os arquivos além da janela guardada. Chamado ao gravar e na subida. */
export async function limparErrosAntigos(): Promise<void> {
  try {
    const corte = new Date(Date.now() - DIAS_MANTIDOS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    for (const nome of await readdir(/* turbopackIgnore: true */ ERROS_ROOT)) {
      if (!nome.endsWith(".jsonl")) continue;
      if (nome.slice(0, 10) < corte) {
        await rm(path.join(ERROS_ROOT, nome), { force: true });
      }
    }
  } catch {
    // Limpeza é manutenção; falhar aqui não afeta o registro.
  }
}
