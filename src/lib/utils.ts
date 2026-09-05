import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fuso em que a plataforma MOSTRA data e hora.
 *
 * Precisa ser explícito. `Intl.DateTimeFormat("pt-BR")` define o formato
 * (dd/mm/aaaa) mas NÃO o fuso: sem esta opção ele usa o fuso de quem executa —
 * e quem executa é o servidor. Em hospedagem Linux isso é UTC, então todo
 * horário aparecia três horas adiantado. Foi assim que "o horário de acesso não
 * bate" chegou como relato: o dado estava certo no banco, a exibição é que
 * mentia.
 *
 * Configurável para o dia em que houver hotel em outro fuso; o Brasil não tem
 * mais horário de verão desde 2019, então o valor padrão serve à rede inteira.
 */
const FUSO = process.env.TZ_EXIBICAO || "America/Sao_Paulo";

/**
 * Data de um INSTANTE — emissão de certificado, conclusão de aula.
 *
 * Para prazo use `formatPrazo`: a diferença não é estilística, ver lá.
 */
export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FUSO,
  }).format(d);
}

/**
 * Data de CALENDÁRIO, sem hora — o prazo de uma matrícula.
 *
 * Formata em UTC, e é de propósito. O `<input type="date">` manda "2026-09-05",
 * que o `new Date()` interpreta como meia-noite UTC. Exibir esse instante em
 * São Paulo dá 05/09 menos três horas, ou seja **04/09**: o prazo apareceria um
 * dia antes do que foi digitado, e o funcionário seria cobrado cedo demais.
 *
 * Aqui o valor não é um momento no tempo, é um dia do calendário. Lê-lo no
 * mesmo fuso em que foi gravado devolve exatamente o dia escolhido.
 */
export function formatPrazo(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Data e hora de um instante — último acesso, registro de atividade. */
export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  }).format(d);
}

export function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function difficultyLabel(difficulty: string) {
  const map: Record<string, string> = {
    INICIANTE: "Iniciante",
    INTERMEDIARIO: "Intermediário",
    AVANCADO: "Avançado",
  };
  return map[difficulty] ?? difficulty;
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: "Rascunho",
    PUBLISHED: "Publicado",
    ARCHIVED: "Arquivado",
  };
  return map[status] ?? status;
}

/**
 * Código de certificado.
 *
 * Sorteado com `crypto.getRandomValues`, e não com `Math.random`. A diferença
 * passou a importar quando a conferência virou pública: com código previsível,
 * dava para adivinhar códigos válidos e ler nome e curso de quem concluiu.
 *
 * A Web Crypto é usada em vez de `node:crypto` porque este arquivo também é
 * importado por componentes de cliente — o import do Node quebraria o pacote
 * do navegador.
 *
 * Alfabeto sem I, O, 0 e 1: o código é lido em voz alta e digitado à mão.
 */
export function randomCode(prefix: string) {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);

  const sorteado = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  const ano = new Date().getFullYear();

  return `${prefix}-${ano}-${sorteado}`;
}
