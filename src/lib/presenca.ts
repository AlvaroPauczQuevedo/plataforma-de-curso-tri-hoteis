/**
 * Check-in presencial por QR.
 *
 * O treinamento em sala já era reconhecido — `ConclusaoExterna` existe para
 * isso —, mas era lançado à mão, um nome por vez. Numa brigada de incêndio com
 * trinta pessoas são trinta lançamentos, e é aí que alguém fica de fora sem
 * ninguém notar. Numa auditoria, o nome que faltou é exatamente o problema.
 *
 * ---
 *
 * **Por que o código gira.**
 *
 * A objeção óbvia a uma lista de presença por QR é a foto: alguém fotografa o
 * código, manda no grupo, e três pessoas que não estavam na sala aparecem
 * treinadas em brigada de incêndio. Isso não é um detalhe de segurança — é a
 * diferença entre um registro que vale numa auditoria e um que não vale.
 *
 * Por isso o código não é fixo. Ele é derivado do segredo da sessão e da
 * JANELA DE TEMPO, muda a cada 30 segundos, e o servidor só aceita a janela
 * corrente e a vizinha. A foto tirada às 14h02 não serve às 14h05. Para marcar
 * presença é preciso estar olhando para a tela naquele instante — que é,
 * literalmente, estar na sala.
 *
 * É o mesmo desenho de um autenticador de dois fatores, e pelo mesmo motivo:
 * o que se quer provar não é "sei o segredo", é "estou aqui agora".
 *
 * ---
 *
 * Tudo aqui é função pura — entra um segredo, um código e um relógio. O
 * `agora` vem por parâmetro pela mesma razão de `situacaoDaObrigacao`: é a
 * única parte cujo resultado depende do tempo, e assim dá para exercitar a
 * virada da janela em teste sem esperar trinta segundos.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Duração da janela, em segundos.
 *
 * Trinta é o mesmo valor dos autenticadores, e por equilíbrio parecido: curto
 * o bastante para a foto no grupo envelhecer antes de ser útil, longo o
 * bastante para alguém apontar a câmera, o celular focar e a página abrir sem
 * o código virar no meio do caminho.
 */
export const JANELA_SEGUNDOS = 30;

/**
 * Alfabeto do código: sem O/0, I/1/L.
 *
 * O mesmo da senha provisória, e pelo mesmo motivo — mas aqui o motivo é ainda
 * mais direto: quando a câmera não lê, alguém digita o código à mão, e num
 * salão com luz ruim `0` e `O` são o mesmo desenho.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Seis caracteres de 5 bits ≈ 30 bits. Chutar é 1 em um bilhão por janela. */
const TAMANHO_DO_CODIGO = 6;

/** O segredo de uma sessão nova. 32 bytes de `randomBytes`, em hexadecimal. */
export function novoSegredoDeSessao(): string {
  return randomBytes(32).toString("hex");
}

/** Em que janela de 30 segundos este instante cai. */
export function janelaDe(agora: Date, segundos = JANELA_SEGUNDOS): number {
  return Math.floor(agora.getTime() / (segundos * 1000));
}

/**
 * O código daquela janela.
 *
 * HMAC-SHA256 do número da janela com o segredo da sessão, dobrado no
 * alfabeto. Derivar em vez de sortear e guardar é o que permite validar sem
 * escrever nada no banco a cada trinta segundos — e sem nenhum estado que
 * possa divergir entre dois processos.
 */
export function codigoDaJanela(segredo: string, janela: number): string {
  const digest = createHmac("sha256", segredo).update(String(janela)).digest();

  let codigo = "";
  for (let i = 0; i < TAMANHO_DO_CODIGO; i += 1) {
    // Um byte por caractere. O módulo não enviesa porque 32 divide 256 exato
    // (oito bytes caem em cada letra) — com um alfabeto de tamanho diferente
    // seria preciso descartar os valores do resto, e não é o caso.
    codigo += ALFABETO[digest[i] % ALFABETO.length];
  }
  return codigo;
}

/** O código que deve estar na tela agora. */
export function codigoVigente(segredo: string, agora: Date): string {
  return codigoDaJanela(segredo, janelaDe(agora));
}

/**
 * Comparação de tempo constante entre dois códigos.
 *
 * `timingSafeEqual` estoura quando os tamanhos diferem, então o tamanho é
 * conferido antes — e essa conferência pode vazar o tamanho, que não é
 * segredo: são sempre seis caracteres.
 */
function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * O código confere?
 *
 * Aceita a janela corrente e a **anterior**. A tolerância existe porque o
 * relógio do celular não é o do servidor, e porque entre apontar a câmera e a
 * página carregar passam alguns segundos — sem ela, quem mira a tela no
 * segundo 29 é recusado sem entender por quê, e vai reclamar que "o QR não
 * funciona".
 *
 * A janela SEGUINTE não é aceita: aceitá-la daria 90 segundos de validade a um
 * código, e a foto no grupo voltaria a servir. Um relógio de celular adiantado
 * é problema de quem o adiantou; a lista de presença não pode afrouxar por
 * isso.
 */
export function codigoValido(segredo: string, codigo: string, agora: Date): boolean {
  if (!codigo) return false;

  const atual = janelaDe(agora);
  const normalizado = codigo.trim().toUpperCase();

  // As duas comparações sempre rodam: sair cedo na primeira revelaria, pelo
  // tempo, qual das janelas casou.
  const casaAtual = iguais(normalizado, codigoDaJanela(segredo, atual));
  const casaAnterior = iguais(normalizado, codigoDaJanela(segredo, atual - 1));

  return casaAtual || casaAnterior;
}

/* ------------------------------------------------------- estado da sessão */

export type SituacaoDaSessao = "aberta" | "encerrada" | "expirada";

export type SessaoParaSituacao = {
  abertaAte: Date | null;
  encerradaEm: Date | null;
};

/**
 * Em que estado a sessão está.
 *
 * Encerrada vence expirada: uma sessão que o instrutor fechou está fechada,
 * tenha ou não passado do horário. É o encerramento que grava as conclusões, e
 * ele é um ato, não um relógio.
 */
export function situacaoDaSessao(sessao: SessaoParaSituacao, agora: Date): SituacaoDaSessao {
  if (sessao.encerradaEm !== null) return "encerrada";
  if (sessao.abertaAte !== null && sessao.abertaAte.getTime() <= agora.getTime()) {
    return "expirada";
  }
  return "aberta";
}

/** Só sessão aberta aceita bipe. */
export function aceitaCheckIn(sessao: SessaoParaSituacao, agora: Date): boolean {
  return situacaoDaSessao(sessao, agora) === "aberta";
}

/* ------------------------------------------------- do bipe para a conclusão */

/**
 * Quem, entre os presentes, ainda precisa de conclusão registrada.
 *
 * `ConclusaoExterna` é única por pessoa e curso — reconhecer o mesmo
 * treinamento duas vezes duplicaria a pessoa em todo relatório. Então o
 * encerramento pula quem já tem: alguém que fez a brigada no ano passado e
 * refez agora não vira duas linhas.
 *
 * Quem já tinha conclusão **não é atualizado** para a data nova. A decisão é
 * da reciclagem, que conta validade a partir da conclusão mais recente e já
 * sabe resolver as duas origens; mexer aqui seria uma segunda regra
 * respondendo à mesma pergunta.
 */
export function presencasParaConcluir(
  presentes: readonly { userId: string }[],
  jaConcluiram: ReadonlySet<string>
): string[] {
  const novos: string[] = [];
  const vistos = new Set<string>();

  for (const presente of presentes) {
    if (jaConcluiram.has(presente.userId) || vistos.has(presente.userId)) continue;
    vistos.add(presente.userId);
    novos.push(presente.userId);
  }
  return novos;
}
