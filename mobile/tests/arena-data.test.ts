import { describe, expect, it, vi } from 'vitest'
import { positions } from '../src/api/client'
import {
  eliminationCapacities, entryState, entryStates, eventFormatParts, eventNoun, eventPhase, eventPhases, eventRefusalReason, eventRefusalReasons,
  eventState, eventStates, eventType, footballFormat, footballFormats, pixKeyType, pixKeyTypes, placementRequired, positionOptions, positionShort,
  rankingTiers, receiptRefusalReason, receiptRefusalReasons, runDistances, shownTier, teamRole, teamRoles, tiers,
} from '../src/data/arena'
import type { TierKey } from '../src/data/arena'
import { eventDateParts, formatClock, formatDeadline, formatPrice, formatRemaining, formatShortDate, parseIso, plural } from '../src/utils/format'
import { monthYear, relativeTime, shortDate } from '../src/utils/relativeTime'
import { teamInitials } from '../src/utils/teamInitials'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const nbsp = String.fromCharCode(160)
/** Instante ISO de uma data e hora locais (o fuso do ambiente de teste não importa). */
const localIso = (...args: [number, number, number, number?, number?]) => new Date(args[0], args[1], args[2], args[3] ?? 0, args[4] ?? 0).toISOString()
const now = new Date(2026, 9, 12, 9, 0)

describe('mapeamentos de times e elos', () => {
  it('deriva os elos por chave de rankingTiers, na mesma ordem', () => {
    expect(Object.keys(tiers)).toEqual(rankingTiers.map(tier => tier.image))
    expect(tiers.lendario).toEqual({ key: 'lendario', name: 'Lendário' })
  })

  it('só exibe elo com a classificação completa', () => {
    expect(placementRequired).toBe(3)
    expect(shownTier('ouro', 3)).toBe('ouro')
    expect(shownTier('ouro', 2)).toBeNull()
    expect(shownTier('ouro', 1, 1)).toBe('ouro')
    expect(shownTier(null, 10)).toBeNull()
    expect(shownTier(undefined, 10)).toBeNull()
    expect(shownTier('ferro' as TierKey, 10)).toBeNull()
  })

  it('descreve os formatos do futebol com o elenco em campo', () => {
    expect(footballFormats.map(format => `${format.label} ${format.size}`)).toEqual(['Futsal 5×5', 'Society 7×7', 'Campo 11×11'])
    expect(footballFormats.every(format => format.size === `${format.players}×${format.players}`)).toBe(true)
    expect(footballFormat.society.players).toBe(7)
  })

  it('soma as siglas às posições sem duplicar os rótulos', () => {
    expect(positionOptions.map(position => position.short)).toEqual(['GOL', 'DEF', 'MEI', 'ATA'])
    expect(positionOptions.map(position => position.label)).toEqual(positions.map(position => position.label))
    expect(positionShort.meio_campo).toBe('MEI')
  })

  it('lista as distâncias da corrida e os papéis do time', () => {
    expect(runDistances.map(distance => distance.label)).toEqual(['3 km', '5 km', '10 km', '21 km', '42 km'])
    expect(runDistances.find(distance => distance.value === 42)?.km).toBe(42.195)
    expect(teamRoles.map(role => role.label)).toEqual(['Representante', 'Membro'])
    expect(teamRole.membro.viewer).toBe('você é membro')
    expect(teamRole.representante.viewer).toBe('você representa')
  })

  it('gera as iniciais do escudo neutro pela regra do servidor', () => {
    expect(teamInitials('Leões do Cerrado')).toBe('LC')
    expect(teamInitials('  Ferrugem   FC ')).toBe('FF')
    expect(teamInitials('Unidos do Guará Futebol')).toBe('UF')
    expect(teamInitials('águias')).toBe('ÁG')
    expect(teamInitials('Do E')).toBe('DE')
    expect(teamInitials('   ')).toBe('?')
  })
})

describe('mapeamentos de eventos, inscrições e comprovantes', () => {
  it('nomeia os estados e as fases do evento com as chaves do plano', () => {
    expect(eventStates.map(state => state.value)).toEqual(['rascunho', 'em_aprovacao', 'publicado', 'em_andamento', 'encerrado', 'cancelado'])
    expect(eventState.publicado.label).toBe('Inscrições abertas')
    expect(eventState.em_aprovacao.tone).toBe('pending')
    expect(eventPhases.map(phase => phase.value)).toContain('inscricoes_encerradas')
    expect(eventPhase.inscricoes_encerradas).toMatchObject({ label: 'Inscrições encerradas', tone: 'closed' })
  })

  it('nomeia os estados da inscrição para o organizador e para o cartaz do atleta', () => {
    expect(entryStates.map(state => state.value)).toEqual([
      'reservada', 'em_analise', 'confirmada', 'rejeitada', 'expirada', 'cancelada', 'devolucao_pendente', 'devolucao_contestada', 'devolvida',
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

  it('lista os motivos de recusa e os tipos de chave Pix (teclado do React Native)', () => {
    expect(receiptRefusalReasons.map(reason => reason.label)).toEqual(['Valor diferente', 'Favorecido errado', 'Comprovante ilegível', 'Data fora do prazo', 'Outro'])
    expect(receiptRefusalReason.fora_do_prazo.label).toBe('Data fora do prazo')
    expect(eventRefusalReasons.map(reason => reason.value)).toEqual(['pix_incompleto', 'preco_ou_datas', 'conteudo_inadequado', 'outro'])
    expect(eventRefusalReason.pix_incompleto.label).toBe('Dados do Pix incompletos')
    expect(pixKeyTypes.map(kind => kind.label)).toEqual(['CPF', 'E-mail', 'Telefone', 'Aleatória'])
    expect(pixKeyType.email.inline).toBe('e-mail')
    expect(pixKeyType.telefone.keyboard).toBe('phone-pad')
  })
})

describe('formatação em pt-BR', () => {
  it('formata centavos em reais, com "Gratuito" para zero ou ausente', () => {
    expect(formatPrice(24000)).toBe(`R$${nbsp}240,00`)
    expect(formatPrice(24050)).toBe(`R$${nbsp}240,50`)
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
  })

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

  it('não depende do formatToParts, que no Hermes do iOS troca os tipos das partes ("qua, de · 13:00")', () => {
    // O que o Hermes devolveu no iPhone: o literal " de " com o tipo do dia e o "." final com o tipo do mês.
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'weekday', value: 'qua.' }, { type: 'weekday', value: ', ' }, { type: 'day', value: '15' }, { type: 'day', value: ' de ' },
      { type: 'month', value: 'out' }, { type: 'month', value: '.' },
    ])
    try {
      expect(formatDeadline(localIso(2026, 9, 14, 13, 0), now)).toBe('qua, 14 out · 13:00')
      expect(eventDateParts(localIso(2026, 9, 25, 20, 0), now)).toMatchObject({ day: '25', month: 'out', weekday: 'dom' })
    } finally {
      spy.mockRestore()
    }
  })

  it('separa as partes da data do cartaz', () => {
    expect(eventDateParts(localIso(2026, 9, 25, 20, 0), now)).toEqual({ day: '25', month: 'out', weekday: 'dom', label: 'domingo, 25 de outubro' })
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
    expect(plural(1, 'comprovante', 'comprovantes')).toBe('1 comprovante')
    expect(plural(3, 'comprovante', 'comprovantes')).toBe('3 comprovantes')
  })

  it('escreve o tempo relativo de convites e pedidos e as datas de registro', () => {
    const base = Date.parse('2026-10-12T12:00:00Z')
    const at = (ms: number) => new Date(base - ms).toISOString()
    expect(relativeTime(at(10_000), base)).toBe('agora')
    expect(relativeTime(at(5 * 60_000), base)).toBe('há 5 min')
    expect(relativeTime(at(3600e3), base)).toBe('há 1 hora')
    expect(relativeTime(at(3 * 3600e3), base)).toBe('há 3 horas')
    expect(relativeTime(at(30 * 3600e3), base)).toBe('ontem')
    expect(relativeTime(at(3 * 86_400e3), base)).toBe('há 3 dias')
    expect(relativeTime(at(10 * 86_400e3), base)).toMatch(/out/)
    expect(relativeTime(at(400 * 86_400e3), base)).toMatch(/2025/)
    expect(relativeTime('data inválida')).toBe('')
    expect(shortDate('2026-10-12T12:00:00Z')).toMatch(/2026/)
    expect(shortDate('x')).toBe('')
    expect(monthYear('2025-03-10T12:00:00Z')).toMatch(/mar.*2025/)
    expect(monthYear('data inválida')).toBe('')
  })
})
