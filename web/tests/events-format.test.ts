import { describe, expect, it } from 'vitest'
import {
  activeNavFor, eliminationCapacities, entryState, entryStates, eventFormatParts, eventNoun, eventRefusalReasons,
  eventState, eventStates, eventType, pixKeyType, pixKeyTypes, receiptRefusalReason, receiptRefusalReasons,
} from '../src/data/arena'
import type { Screen } from '../src/data/arena'
import { copyFeedback } from '../src/components/events/pix'
import { combineDateTime, fromDateKey, splitDateTime, startOfToday, toDateKey } from '../src/utils/dateKey'
import {
  eventDateParts, formatClock, formatDeadline, formatPrice, formatRemaining, formatShortDate, parseIso,
} from '../src/utils/format'

const nbsp = ' '
/** Instante ISO de uma data e hora locais (o fuso do ambiente de teste não importa). */
const localIso = (...args: [number, number, number, number?, number?]) => new Date(args[0], args[1], args[2], args[3] ?? 0, args[4] ?? 0).toISOString()
const now = new Date(2026, 9, 12, 9, 0)

describe('formatPrice', () => {
  it('formata centavos em reais, com "Gratuito" para zero ou ausente', () => {
    expect(formatPrice(24000)).toBe(`R$${nbsp}240,00`)
    expect(formatPrice(24050)).toBe(`R$${nbsp}240,50`)
    expect(formatPrice(123456789)).toBe(`R$${nbsp}1.234.567,89`)
    expect(formatPrice(0)).toBe('Gratuito')
    expect(formatPrice(-100)).toBe('Gratuito')
    expect(formatPrice(null)).toBe('Gratuito')
    expect(formatPrice(undefined)).toBe('Gratuito')
    expect(formatPrice(Number.NaN)).toBe('Gratuito')
    expect(formatPrice(0, { free: 'Gratuita' })).toBe('Gratuita')
  })

  it('omite os centavos no cartaz só quando o valor é inteiro', () => {
    expect(formatPrice(24000, { compact: true })).toBe(`R$${nbsp}240`)
    expect(formatPrice(24050, { compact: true })).toBe(`R$${nbsp}240,50`)
    expect(formatPrice(6000.4, { compact: true })).toBe(`R$${nbsp}60`)
  })
})

describe('datas no fuso local', () => {
  it('mostra o prazo como "ter, 20 out · 16:00", com o ano só fora do ano corrente', () => {
    expect(formatDeadline(localIso(2026, 9, 20, 16, 0), now)).toBe('ter, 20 out · 16:00')
    expect(formatDeadline(localIso(2026, 9, 13, 9, 5), now)).toBe('ter, 13 out · 09:05')
    expect(formatDeadline(localIso(2027, 0, 4, 0, 0), now)).toBe('seg, 4 jan 2027 · 00:00')
    expect(formatDeadline('não é data', now)).toBe('')
    expect(formatDeadline(null)).toBe('')
    expect(formatShortDate(new Date(2026, 4, 1), now)).toBe('sex, 1 mai')
    expect(formatClock(new Date(2026, 9, 12, 23, 59))).toBe('23:59')
    expect(parseIso('')).toBeNull()
  })

  it('separa as partes da data do cartaz', () => {
    expect(eventDateParts(localIso(2026, 9, 25, 20, 0), now)).toEqual({
      day: '25', month: 'out', weekday: 'dom', label: 'domingo, 25 de outubro',
    })
    expect(eventDateParts(localIso(2027, 6, 12), now)?.label).toBe('segunda-feira, 12 de julho de 2027')
    expect(eventDateParts(null)).toBeNull()
  })

  it('conta o tempo restante em horas cheias e, na última hora, em minutos', () => {
    expect(formatRemaining(46 * 3_600_000 + 59 * 60_000)).toEqual({ short: '46 h', long: '46 horas restantes' })
    expect(formatRemaining(3_600_000)).toEqual({ short: '1 h', long: '1 hora restante' })
    expect(formatRemaining(35 * 60_000)).toEqual({ short: '35 min', long: '35 minutos restantes' })
    expect(formatRemaining(30_000)).toEqual({ short: '1 min', long: '1 minuto restante' })
    expect(formatRemaining(0)).toEqual({ short: '0 h', long: 'Prazo encerrado' })
    expect(formatRemaining(Number.NaN).long).toBe('Prazo encerrado')
  })

  it('converte o dia do calendário e a hora para o ISO da API e de volta', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(fromDateKey('2026-10-25')?.getTime()).toBe(new Date(2026, 9, 25).getTime())
    expect(fromDateKey('2026-02-31')).toBeUndefined()
    expect(fromDateKey('25/10/2026')).toBeUndefined()
    expect(fromDateKey(undefined)).toBeUndefined()
    expect(startOfToday(new Date(2026, 9, 12, 18, 40)).getTime()).toBe(new Date(2026, 9, 12).getTime())

    const iso = combineDateTime('2026-10-25', '20:15')
    expect(iso).toBe(localIso(2026, 9, 25, 20, 15))
    expect(splitDateTime(iso)).toEqual({ date: '2026-10-25', time: '20:15' })
    expect(combineDateTime('2026-10-25', '')).toBeNull()
    expect(combineDateTime('2026-10-25', '24:00')).toBeNull()
    expect(combineDateTime('', '10:00')).toBeNull()
    expect(splitDateTime('x')).toBeNull()
    expect(splitDateTime(null)).toBeNull()
  })
})

describe('mapeamentos da etapa 2', () => {
  it('nomeia os estados do evento com as chaves do plano', () => {
    expect(eventStates.map(state => state.value)).toEqual(['rascunho', 'em_aprovacao', 'publicado', 'em_andamento', 'encerrado', 'cancelado'])
    expect(eventState.publicado.label).toBe('Inscrições abertas')
    expect(eventState.em_aprovacao.tone).toBe('pending')
  })

  it('nomeia os estados da inscrição para o organizador e para o cartaz do atleta', () => {
    expect(entryStates.map(state => state.value)).toEqual([
      'reservada', 'em_analise', 'confirmada', 'rejeitada', 'expirada', 'cancelada', 'devolucao_pendente',
      'devolucao_contestada', 'devolvida',
    ])
    expect(entryState.em_analise.label).toBe('Comprovante em análise')
    expect(entryState.confirmada.short).toBe('Inscrito')
    expect(entryState.rejeitada.tone).toBe('danger')
    expect(entryState.devolucao_contestada.label).toBe('Devolução contestada')
    expect(entryState.devolucao_contestada.short).toBe('Contestada')
  })

  it('monta a linha de formato por modalidade', () => {
    expect(eventFormatParts({ sport: 'futebol', format: 'society', eventType: 'eliminacao_simples' })).toEqual(['Society 7×7', 'Eliminação simples'])
    expect(eventFormatParts({ sport: 'futebol', format: null, eventType: null })).toEqual([])
    expect(eventFormatParts({ sport: 'tenis', format: 'campo', eventType: 'todos_contra_todos' })).toEqual(['Todos contra todos'])
    expect(eventFormatParts({ sport: 'corrida', distanceKm: 10, eventType: 'eliminacao_simples' })).toEqual(['10 km', 'Prova'])
    expect(eventFormatParts({ sport: 'corrida', distanceKm: 21.1 })).toEqual(['21,1 km', 'Prova'])
    expect(eventFormatParts({ sport: 'corrida' })).toEqual(['Prova'])
    expect(eventType.todos_contra_todos.label).toBe('Todos contra todos')
    expect(eliminationCapacities).toEqual([4, 8, 16])
    expect(eventNoun.corrida.many).toBe('Provas')
    expect(eventNoun.futebol.entrants).toBe('times')
  })

  it('lista os motivos de recusa e os tipos de chave Pix', () => {
    expect(receiptRefusalReasons.map(reason => reason.label)).toEqual([
      'Valor diferente', 'Favorecido errado', 'Comprovante ilegível', 'Data fora do prazo', 'Outro',
    ])
    expect(receiptRefusalReason.fora_do_prazo.label).toBe('Data fora do prazo')
    expect(eventRefusalReasons.map(reason => reason.value)).toEqual(['pix_incompleto', 'preco_ou_datas', 'conteudo_inadequado', 'outro'])
    expect(pixKeyTypes.map(kind => kind.label)).toEqual(['CPF', 'E-mail', 'Telefone', 'Aleatória'])
    expect(pixKeyType.email.inline).toBe('e-mail')
    expect(pixKeyType.telefone.inputMode).toBe('tel')
  })

  it('descreve o retorno de cada cópia do Pix', () => {
    expect(copyFeedback('copied', 'chave')).toBe('Chave Pix copiada.')
    expect(copyFeedback('failed', 'codigo')).toContain('Selecione o código')
    expect(copyFeedback('idle', 'chave')).toBe('')
    expect(copyFeedback('copied', null)).toBe('')
    expect(copyFeedback('copied', 'outra')).toBe('')
  })

  it.each<[Screen, Screen, Screen]>([
    ['events', 'play', 'play'],
    ['event', 'play', 'play'],
    ['organizer-events', 'profile', 'profile'],
    ['event-wizard', 'profile', 'profile'],
    ['event-manage', 'profile', 'profile'],
    ['event-receipts', 'profile', 'profile'],
    ['admin-paid-events', 'profile', 'profile'],
    ['admin-revoked-events', 'profile', 'profile'],
    ['admin-refund-disputes', 'profile', 'profile'],
    ['user-profile', 'events', 'play'],
    ['user-profile', 'event-manage', 'profile'],
  ])('%s com a pilha a partir de %s acende %s', (screen, root, active) => {
    expect(activeNavFor(screen, root)).toBe(active)
  })
})
