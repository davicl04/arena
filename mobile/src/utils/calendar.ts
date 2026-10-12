import { fromDateKey, toDateKey } from './dateKey'

/*
 * Regras do calendário do `DateField` (pt-BR, semana começando no domingo): as semanas de um mês, a navegação por mês
 * e os textos. Os meses são índices de 0 (janeiro) a 11, como em `Date`.
 */

export const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export interface MonthView { year: number; month: number }

/** Semanas do mês (domingo primeiro): o dia do mês ou `null` nas células vazias antes do dia 1 e depois do último. */
export function monthWeeks({ year, month }: MonthView): (number | null)[][] {
  const lead = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

/** Mês vizinho (`delta` de −1 ou +1, ou mais), virando o ano quando preciso. */
export function addMonths({ year, month }: MonthView, delta: number): MonthView {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

export const monthOf = (date: Date): MonthView => ({ year: date.getFullYear(), month: date.getMonth() })
export const monthKey = ({ year, month }: MonthView) => year * 12 + month
/** "outubro de 2026". */
export const monthTitle = (view: MonthView) => monthFormat.format(new Date(view.year, view.month, 1))
/** "sábado, 25 de outubro de 2026" (nome acessível do dia). */
export const dayLabel = (date: Date) => dayFormat.format(date)
/** Chave "AAAA-MM-DD" de um dia do mês exibido. */
export const dayKey = ({ year, month }: MonthView, day: number) => toDateKey(new Date(year, month, day))

/** O dia pode ser escolhido? `min` e `max` são chaves "AAAA-MM-DD" (inclusivas) e podem faltar. */
export function dayAllowed(key: string, min?: string, max?: string): boolean {
  return (!min || key >= min) && (!max || key <= max)
}

/** Primeiro mês exibido ao abrir: o do valor, senão o do primeiro dia permitido, senão o de hoje. */
export function initialMonth(value: string, floor: string | undefined, today: Date): MonthView {
  return monthOf(fromDateKey(value) ?? fromDateKey(floor) ?? today)
}
