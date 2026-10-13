import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocialUser } from '../src/api/client'
import { filterOptions } from '../src/components/notifications/NotificationsPlate'
import { followRequestNames } from '../src/components/notifications/FollowRequestsLine'
import { deadlineSentence, groupByDay, notificationFilters, pendingDeadline, pendingView, remainingText, summaryLine } from '../src/data/notifications'
import { note, pendingNote, resetNotificationIds, summaryOf } from './support/notifications'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())

const MIN = 60_000
const HOUR = 60 * MIN

beforeEach(() => {
  resetNotificationIds()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 13, 15, 0, 0))
})
afterEach(() => { vi.useRealTimers() })

describe('pendingView: rótulo curto, linha secundária e botão de cada tipo com pendência', () => {
  it('usa exatamente os textos da tabela dos 14 tipos', () => {
    const table: [string, string, string][] = [
      ['convite_time', 'CONVITE DE TIME', 'Ver convite'],
      ['pedido_entrada', 'PEDIDO PARA ENTRAR', 'Ver pedido'],
      ['proposta_partida', 'PARTIDA ENCONTRADA', 'Responder proposta'],
      ['vaga_encontrada', 'VAGA ENCONTRADA', 'Responder vaga'],
      ['condicoes_propostas', 'CONDIÇÕES PROPOSTAS', 'Ver condições'],
      ['wo_registrado', 'W.O. REGISTRADO', 'Contestar W.O.'],
      ['resultado_divergente', 'RESULTADO DIVERGENTE', 'Revisar resultado'],
      ['comprovante_decidido', 'COMPROVANTE RECUSADO', 'Enviar comprovante'],
      ['devolucao_enviada', 'DEVOLUÇÃO ENVIADA', 'Confirmar devolução'],
      ['comprovante_recebido', 'COMPROVANTE RECEBIDO', 'Analisar comprovante'],
      ['divergencia_para_decidir', 'DIVERGÊNCIA PARA DECIDIR', 'Decidir resultado'],
      ['evento_para_aprovar', 'EVENTO PARA APROVAR', 'Analisar evento'],
      ['devolucao_contestada', 'DEVOLUÇÃO CONTESTADA', 'Decidir devolução'],
      ['wo_contestado', 'W.O. CONTESTADO', 'Decidir W.O.'],
    ]
    for (const [type, label, action] of table) expect(pendingView(pendingNote(type)), type).toMatchObject({ label, action })
    expect(pendingView(pendingNote('tipo_novo'))).toEqual({ label: 'PEDE SUA RESPOSTA', secondary: '', action: 'Abrir' })
  })

  it('monta a linha secundária com os dados do aviso e some quando eles faltam', () => {
    const at = new Date(2026, 9, 20, 16, 0).toISOString()
    const secondary = (type: string, payload: Record<string, unknown> = {}, actor: string | null = null) => pendingView(pendingNote(type, payload, actor)).secondary
    expect(secondary('convite_time', { team_name: 'Várzea Unida' }, 'Marina Costa')).toBe('Marina Costa · Várzea Unida')
    expect(secondary('pedido_entrada', { team_name: 'Várzea Unida' })).toBe('Várzea Unida')
    expect(secondary('proposta_partida', { opponent_name: 'Leões da Vila', format: 'society' })).toBe('Leões da Vila · society 7×7')
    expect(secondary('proposta_partida', { opponent_name: 'Leões da Vila', format: 'inexistente' })).toBe('Leões da Vila')
    expect(secondary('vaga_encontrada', { position: 'goleiro', team_name: 'Ferrugem FC' })).toBe('Goleiro · Ferrugem FC')
    expect(secondary('condicoes_propostas', { starts_at: at, court_name: 'Arena Sul' }, 'Caio Ramos')).toMatch(/^Caio Ramos · \w{3}, 20 out · 16:00 · Arena Sul$/)
    expect(secondary('wo_registrado', { opponent_name: 'Atlético Norte', contest_until: at })).toMatch(/^Atlético Norte · conteste até \w{3}, 20 out · 16:00$/)
    expect(secondary('wo_registrado', {}, 'Caio Ramos')).toBe('Caio Ramos')
    expect(secondary('resultado_divergente', { deadline: at })).toMatch(/^Corrijam até \w{3}, 20 out · 16:00$/)
    expect(secondary('resultado_divergente')).toBe('')
    expect(secondary('comprovante_decidido', { event_name: 'Copa Sudoeste' }, 'Liga Sul')).toBe('Copa Sudoeste')
    expect(secondary('comprovante_recebido', { event_name: 'Copa Sudoeste' }, 'Maria Souza')).toBe('Copa Sudoeste · Maria Souza')
    expect(secondary('evento_para_aprovar', { event_name: 'Copa Sudoeste' }, 'Liga Sul')).toBe('Copa Sudoeste · Liga Sul')
    expect(secondary('wo_contestado', {}, 'Caio Ramos')).toBe('Caio Ramos')
    expect(secondary('wo_contestado')).toBe('')
    expect(pendingView({ ...pendingNote('convite_time'), payload: null as never }).secondary).toBe('')
  })
})

describe('prazo da pendência', () => {
  it('escreve o que falta em minutos, horas e dias', () => {
    expect(remainingText(30_000)).toBe('menos de 1 min')
    expect(remainingText(35 * MIN)).toBe('35 min')
    expect(remainingText(HOUR + 52 * MIN + 30_000)).toBe('1 h 52')
    expect(remainingText(2 * HOUR)).toBe('2 h')
    expect(remainingText(HOUR + 5 * MIN)).toBe('1 h 05')
    expect(remainingText(29 * HOUR)).toBe('1 dia 5 h')
    expect(remainingText(72 * HOUR)).toBe('3 dias')
  })

  it('a barra vai de created_at até action_until; âmbar com menos de 25% do tempo ou menos de 3 h', () => {
    const now = Date.now()
    const deadline = (agoH: number, leftH: number | null) => pendingDeadline(pendingNote('proposta_partida', {}, null, { agoH, leftH }), now)
    expect(deadline(1, 30)).toMatchObject({ remaining: '1 dia 6 h', warn: false })
    expect(deadline(1, 30).fraction).toBeCloseTo(30 / 31)
    expect(deadline(1, 2)).toMatchObject({ remaining: '2 h', warn: true })
    expect(deadline(70, 10)).toMatchObject({ remaining: '10 h', warn: true })
    expect(deadline(10, 70)).toMatchObject({ warn: false })
    expect(deadline(1, null)).toEqual({ remaining: null, fraction: null, warn: false })
    expect(deadline(1, -1)).toEqual({ remaining: 'encerrado', fraction: 0, warn: true })
    // Prazo anterior à criação (relógio torto): barra cheia, sem quebrar.
    expect(pendingDeadline(pendingNote('proposta_partida', {}, null, { created_at: new Date(now + 5 * HOUR).toISOString(), action_until: new Date(now + 4 * HOUR).toISOString() }), now)).toMatchObject({ fraction: 1 })
    expect(pendingDeadline({ ...pendingNote('proposta_partida'), action_until: 'não é data' }, now).remaining).toBeNull()
  })

  it('"faltam 1 h 52", "sem prazo" e "prazo encerrado"', () => {
    expect(deadlineSentence({ remaining: '1 h 52', fraction: 0.5, warn: true })).toBe('faltam 1 h 52')
    expect(deadlineSentence({ remaining: null, fraction: null, warn: false })).toBe('sem prazo')
    expect(deadlineSentence({ remaining: 'encerrado', fraction: 0, warn: true })).toBe('prazo encerrado')
  })
})

describe('groupByDay', () => {
  const ago = (hours: number) => note('aviso_evento', {}, null, { created_at: new Date(Date.now() - hours * HOUR).toISOString() })

  it('agrupa por dia local na ordem recebida: Hoje, Ontem, Esta semana e Anteriores', () => {
    const items = [ago(0.1), ago(5), ago(16), ago(40), ago(24 * 3), ago(24 * 6), ago(24 * 7), ago(24 * 30)]
    const groups = groupByDay(items)
    expect(groups.map(group => [group.label, group.items.length])).toEqual([['Hoje', 2], ['Ontem', 1], ['Esta semana', 3], ['Anteriores', 2]])
    expect(groups.flatMap(group => group.items)).toEqual(items)
  })

  it('só cria os grupos que têm itens, junta vizinhos do mesmo dia e põe datas inválidas e futuras em Hoje', () => {
    expect(groupByDay([])).toEqual([])
    const odd = note('aviso_evento', {}, null, { created_at: 'sem data' })
    const future = ago(-2)
    expect(groupByDay([odd, future]).map(group => group.label)).toEqual(['Hoje'])
    expect(groupByDay([ago(30), ago(100)], Date.now()).map(group => group.label)).toEqual(['Ontem', 'Esta semana'])
  })
})

describe('linha de resumo e chips', () => {
  it('"4 não lidas · 3 pedem sua resposta", "Tudo lido · 3 ainda pedem sua resposta" e "Tudo em dia"', () => {
    expect(summaryLine(summaryOf({ unread_count: 4, pending_count: 3 }))).toBe('4 não lidas · 3 pedem sua resposta')
    expect(summaryLine(summaryOf({ unread_count: 1, pending_count: 1 }))).toBe('1 não lida · 1 pede sua resposta')
    expect(summaryLine(summaryOf({ unread_count: 2 }))).toBe('2 não lidas')
    expect(summaryLine(summaryOf({ pending_count: 3 }))).toBe('Tudo lido · 3 ainda pedem sua resposta')
    expect(summaryLine(summaryOf({ pending_count: 1 }))).toBe('Tudo lido · 1 ainda pede sua resposta')
    expect(summaryLine(summaryOf())).toBe('Tudo em dia')
  })

  it('os cinco chips, na ordem; os números só onde o plano manda', () => {
    expect(notificationFilters.map(filter => filter.label)).toEqual(['Tudo', 'Para responder', 'Partidas', 'Times', 'Eventos'])
    expect(filterOptions(null).every(option => option.detail === undefined)).toBe(true)
    expect(filterOptions(summaryOf({ unread_count: 9, pending_count: 2, by: { partidas: 3 } })).map(option => [option.label, option.detail])).toEqual([
      ['Tudo', undefined], ['Para responder', '2'], ['Partidas', '3'], ['Times', undefined], ['Eventos', undefined],
    ])
  })
})

describe('nomes da linha dos pedidos para seguir', () => {
  const user = (name: string) => ({ id: name.length, name, username: name, avatar_url: null }) as unknown as SocialUser
  it('um, dois ou mais nomes', () => {
    expect(followRequestNames([], 0)).toBe('')
    expect(followRequestNames([user('Bruna Alves')], 1)).toBe('Bruna Alves')
    expect(followRequestNames([user('Bruna Alves'), user('Diego Souza')], 2)).toBe('Bruna Alves e Diego Souza')
    expect(followRequestNames([user('Bruna Alves'), user('Diego Souza'), user('Eva Lima')], 3)).toBe('Bruna Alves, Diego Souza e mais 1')
  })
})
