/*
 * Valores dos campos de data e hora (porta de `web/src/utils/dateKey.ts`). O `DateField` trabalha com o dia do
 * calendário local ("2026-10-25") e o `TimeField` com "HH:MM"; a API recebe e devolve instantes ISO 8601 (UTC).
 * Estas funções fazem a ponte. Chaves de dia comparam como texto (a ordem alfabética é a cronológica).
 */

const pad = (value: number) => String(value).padStart(2, '0')

/** Dia local de uma data, como "2026-10-25". */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Meia-noite local de "2026-10-25". Valor inválido ou inexistente (ex.: 31 de fevereiro) → `undefined`. */
export function fromDateKey(key: string | null | undefined): Date | undefined {
  const match = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null
  if (!match) return undefined
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const date = new Date(year, month, day)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : undefined
}

/** Meia-noite local de hoje (limite dos dias passados no calendário). */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Dia local + "HH:MM" → instante ISO (UTC) para a API. Campos incompletos → `null`. */
export function combineDateTime(dateKey: string, time: string): string | null {
  const date = fromDateKey(dateKey)
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!date || !match) return null
  const [hours, minutes] = [Number(match[1]), Number(match[2])]
  if (hours > 23 || minutes > 59) return null
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

/** Instante ISO da API → dia local e "HH:MM" para preencher os campos. ISO inválido → `null`. */
export function splitDateTime(iso: string | null | undefined): { date: string; time: string } | null {
  const date = iso ? new Date(iso) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return { date: toDateKey(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` }
}
