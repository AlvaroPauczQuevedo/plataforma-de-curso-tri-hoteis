import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
