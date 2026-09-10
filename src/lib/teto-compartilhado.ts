/**
 * Teto por janela de tempo, COMPARTILHADO entre os processos do servidor.
 *
 * `lib/teto-de-avisos` guarda a regra pura; ela conta certo, mas o contador
 * vivia numa variável de módulo. A hospedagem sobe VÁRIOS processos — é a
 * mesma descoberta que obrigou o relatório de migração a ir para arquivo — e
 * um contador por processo não é um teto: com quatro processos, um teto de 60
 * por minuto deixa passar 240, contra um disco que é um só.
 *
 * Então o estado mora num arquivo, ao lado do relatório da última migração e
 * pelo mesmo motivo daquele: é estado DO SERVIDOR, não da requisição, e
 * precisa sobreviver ao processo que o escreveu.
 *
 * Duas ressalvas assumidas:
 *
 *  - **Ler-alterar-gravar não é atômico.** Dois processos que leiam o mesmo
 *    arquivo no mesmo instante contam um evento a menos entre eles. Numa
 *    enxurrada isso deixa passar alguns a mais, e tudo bem: o objetivo não é
 *    contar exato, é não deixar o disco encher nem a caixa de e-mail de alguém
 *    transbordar. Trocar isso por um banco custaria uma escrita em SQLite por
 *    evento — justamente o recurso que se está protegendo.
 *  - **Gravação síncrona, inclusive no evento RECUSADO.** É o custo que vale
 *    dizer: antes, quem estourava o teto não tocava em disco nenhum, e agora
 *    paga uma leitura e uma gravação. O arquivo tem alguns poucos KB, fica no
 *    cache do sistema e custa muito menos do que a requisição HTTP que já foi
 *    montada para chegar até aqui — mas é bom saber disso antes de usar este
 *    módulo num caminho que receba tráfego de verdade. A gravação é por
 *    `rename`, que o sistema de arquivos resolve de uma vez: processo morto no
 *    meio não deixa JSON pela metade para o seguinte ler.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ERROS_ROOT } from "@/lib/registro-de-erros";
import { consumirVaga, JANELA_NOVA, type Janela } from "@/lib/teto-de-avisos";

/**
 * Ao lado do registro de erros, não dentro dele.
 *
 * `limparErrosAntigos()` só apaga `.jsonl`, então guardar aqui dentro seria
 * seguro hoje — mas seria depender de um detalhe de outra função. O relatório
 * de migração já escolheu este lugar para estado do servidor; um lugar só para
 * as duas coisas é mais fácil de achar no dia em que faltar espaço.
 */
const PASTA = path.resolve(ERROS_ROOT, "..");

/** Uma janela por chave: a global, e uma por conta, por exemplo. */
export type Mapa = Record<string, Janela>;

/**
 * Conta um evento no mapa e devolve o mapa novo e se ele coube.
 *
 * Pura, e é onde está toda a decisão — o arquivo à volta é só onde ela mora.
 * Chaves cuja janela já passou há mais de uma duração são descartadas: sem
 * isso, um teto por conta acumularia uma entrada por funcionário para sempre.
 */
export function consumirDoMapa(
  mapa: Mapa,
  chave: string,
  agora: number,
  teto: number,
  duracaoMs: number
): { mapa: Mapa; aceito: boolean } {
  const vaga = consumirVaga(mapa[chave] ?? JANELA_NOVA, agora, teto, duracaoMs);

  const novo: Mapa = { [chave]: vaga.janela };

  for (const [outra, janela] of Object.entries(mapa)) {
    if (outra === chave) continue;
    // Duas durações de folga: a janela em si, mais a seguinte inteira.
    if (agora - janela.comecouEm > duracaoMs * 2) continue;
    novo[outra] = janela;
  }

  return { mapa: novo, aceito: vaga.aceito };
}

function ler(arquivo: string): Mapa {
  try {
    const conteudo = JSON.parse(readFileSync(arquivo, "utf8")) as unknown;
    if (!conteudo || typeof conteudo !== "object") return {};
    return conteudo as Mapa;
  } catch {
    // Arquivo ausente na primeira vez, ou ilegível: começar do zero é o
    // comportamento certo nos dois casos.
    return {};
  }
}

function gravar(arquivo: string, mapa: Mapa): void {
  const temporario = `${arquivo}.${process.pid}.tmp`;
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(temporario, JSON.stringify(mapa), "utf8");
  renameSync(temporario, arquivo);
}

/**
 * Conta um evento e diz se ele cabe no teto.
 *
 * Falhando a gravação — pasta somente-leitura, disco cheio — o evento é
 * ACEITO. É a escolha deliberada: o teto existe para proteger o disco, e
 * recusar tudo por não conseguir escrever o contador transformaria um problema
 * de manutenção em indisponibilidade de uma rota que já é o último recurso de
 * diagnóstico.
 */
export function consumirVagaCompartilhada(params: {
  /** Nome do arquivo, sem caminho: "avisos-de-tela.json", por exemplo. */
  arquivo: string;
  chave: string;
  teto: number;
  duracaoMs: number;
  agora?: number;
}): boolean {
  const caminho = path.join(PASTA, params.arquivo);

  try {
    const { mapa, aceito } = consumirDoMapa(
      ler(caminho),
      params.chave,
      params.agora ?? Date.now(),
      params.teto,
      params.duracaoMs
    );

    gravar(caminho, mapa);
    return aceito;
  } catch {
    return true;
  }
}
