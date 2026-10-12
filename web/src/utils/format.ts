/*
 * Formatação em pt-BR para eventos, inscrições e prazos. Datas chegam da API em ISO 8601 (UTC) e são mostradas
 * no fuso local do aparelho; preços chegam em centavos. Os separadores seguem os protótipos ("seg, 20 out · 16:00").
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlWhole = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const shortDate = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const longDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

/** Plural simples ("1 comprovante", "3 comprovantes"). */
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export interface FormatPriceOptions {
  /** Sem os centavos quando o valor é inteiro ("R$ 240"), como nos cartazes. */
  compact?: boolean;
  /** Texto para inscrição sem custo (padrão "Gratuito"). */
  free?: string;
}

/**
 * Preço em centavos → "R$ 240,00" (ou "R$ 240" com `compact`). Zero, negativo ou ausente → "Gratuito".
 * O espaço depois de "R$" é o inseparável do `Intl`, para o valor não quebrar a linha.
 */
export function formatPrice(
  cents: number | null | undefined,
  { compact = false, free = "Gratuito" }: FormatPriceOptions = {},
): string {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return free;
  const reais = Math.round(cents) / 100;
  return (compact && Number.isInteger(reais) ? brlWhole : brl).format(reais);
}

/** Data ISO válida ou `null`. */
export function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Abreviações do `Intl` sem o ponto final ("seg." → "seg", "out." → "out"). */
const bare = (value = "") => value.replace(/\.$/, "").toLowerCase();

function partsOf(format: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value])) as Partial<
    Record<Intl.DateTimeFormatPartTypes, string>
  >;
}

/** "sáb, 25 out" no fuso local; o ano aparece quando não é o de `now`. */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  const part = partsOf(shortDate, date);
  const text = `${bare(part.weekday)}, ${part.day} ${bare(part.month)}`;
  return date.getFullYear() === now.getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

/** "16:00" no fuso local. */
export function formatClock(date: Date): string {
  return clock.format(date);
}

/** Prazo "seg, 20 out · 16:00" no fuso local (ano só fora do ano corrente). ISO inválido → "". */
export function formatDeadline(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parseIso(iso);
  return date ? `${formatShortDate(date, now)} · ${formatClock(date)}` : "";
}

export interface EventDateParts {
  /** Dia do mês, em destaque no cartaz ("25"). */
  day: string;
  /** Mês abreviado, sem ponto ("out"); o cartaz o mostra em caixa alta. */
  month: string;
  /** Dia da semana abreviado ("sáb"). */
  weekday: string;
  /** Data por extenso para leitores de tela ("sábado, 25 de outubro", com o ano fora do ano corrente). */
  label: string;
}

/** Partes da data do cartaz (E2, O3, D2 e G3) no fuso local. ISO inválido ou ausente → `null`. */
export function eventDateParts(iso: string | null | undefined, now: Date = new Date()): EventDateParts | null {
  const date = parseIso(iso);
  if (!date) return null;
  const part = partsOf(shortDate, date);
  const label = longDate.format(date);
  return {
    day: String(date.getDate()),
    month: bare(part.month),
    weekday: bare(part.weekday),
    label: date.getFullYear() === now.getFullYear() ? label : `${label} de ${date.getFullYear()}`,
  };
}

export interface Remaining {
  /** Texto do anel: "46 h", "35 min" ou "0 h". */
  short: string;
  /** Texto para leitores de tela: "46 horas restantes", "35 minutos restantes" ou "Prazo encerrado". */
  long: string;
}

/** Tempo restante até o prazo: horas cheias acima de 1 h e minutos abaixo disso. */
export function formatRemaining(ms: number): Remaining {
  if (!Number.isFinite(ms) || ms <= 0) return { short: "0 h", long: "Prazo encerrado" };
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60)
    return { short: `${minutes} min`, long: `${minutes} ${minutes === 1 ? "minuto restante" : "minutos restantes"}` };
  const hours = Math.floor(minutes / 60);
  return { short: `${hours} h`, long: `${hours} ${hours === 1 ? "hora restante" : "horas restantes"}` };
}
