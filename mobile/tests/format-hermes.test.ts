import { afterEach, describe, expect, it, vi } from 'vitest'
import { eventDateParts, formatDayMonth, formatDeadline, formatShortDate } from '../src/utils/format'

// No Hermes do iOS, `formatToParts` rotula as partes errado ("27" como literal, "de" como day, mês vazio).
const mislabeled = () => [
  { type: 'weekday', value: 'seg' }, { type: 'literal', value: '27' }, { type: 'day', value: 'de' }, { type: 'month', value: '' },
] as Intl.DateTimeFormatPart[]

describe('datas sem formatToParts (bug do Hermes)', () => {
  afterEach(() => vi.restoreAllMocks())
  const now = new Date(2026, 10, 27, 12)
  const date = new Date(2026, 10, 30, 19, 0)

  it('segue correto com partes mal rotuladas ou com erro', () => {
    for (const impl of [mislabeled, () => { throw new Error('formatToParts quebrado') }]) {
      vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(impl)
      expect(formatShortDate(date, now)).toBe('seg, 30 nov')
      expect(formatDeadline(date.toISOString(), now)).toBe('seg, 30 nov · 19:00')
      expect(eventDateParts(date.toISOString(), now)).toEqual({ day: '30', month: 'nov', weekday: 'seg', label: 'segunda-feira, 30 de novembro' })
      vi.restoreAllMocks()
    }
  })

  it('formatDayMonth mostra o ano só fora do ano corrente', () => {
    expect(formatDayMonth(new Date(2026, 10, 27), now)).toBe('27 nov')
    expect(formatDayMonth(new Date(2025, 0, 5), now)).toBe('5 jan 2025')
  })
})
