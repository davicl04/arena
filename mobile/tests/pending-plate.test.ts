import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import HomeScreen from '../src/screens/HomeScreen'
import { enableAct } from './support/native'
import { allText, byId, callsTo, me, navigationMock, pressButton, render, serve } from './support/events'
import { note, pendingNote, resetNotificationIds, summaryOf } from './support/notifications'
import { notificationSummaryState, standings } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const PENDING = '/me/notifications/pending?limit=2'
const STANDINGS = '/me/standings'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  resetNotificationIds()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 13, 15, 0, 0))
})
afterEach(() => { vi.useRealTimers() })

const proposal = () => pendingNote('proposta_partida', { match_id: 12, opponent_name: 'Leões da Vila', format: 'society' }, null, { agoH: 1, leftH: 1.5 })
const invite = () => pendingNote('convite_time', { team_id: 3, team_name: 'Várzea Unida' }, 'Marina Costa', { agoH: 2, leftH: null })

async function mountHome({ items = [] as unknown[], summary = summaryOf({ pending_count: items.length }) as ReturnType<typeof summaryOf> | null, extra = {} as Record<string, unknown>, user = me } = {}) {
  const navigation = navigationMock()
  const onExpired = vi.fn()
  const notificationSummary = notificationSummaryState(summary)
  serve({ [STANDINGS]: standings(), [PENDING]: { items }, ...extra })
  const tree = await render(h(HomeScreen, { user, navigation, onExpired, notificationSummary }))
  return { tree, navigation, onExpired, notificationSummary }
}

describe('Início: placa "Para responder"', () => {
  it('abaixo do cumprimento e antes de "Seu elo": título, pílula com o total, até 2 linhas e o link "Ver as N pendências"', async () => {
    const { tree } = await mountHome({ items: [proposal(), invite()], summary: summaryOf({ pending_count: 3 }) })
    expect(byId(tree, 'pending-plate')).toHaveLength(1)
    const text = allText(tree)
    expect(text.indexOf('Bora jogar')).toBeLessThan(text.indexOf('Para responder'))
    expect(text.indexOf('Para responder')).toBeLessThan(text.indexOf('SEU ELO'))
    const plate = allText({ root: byId(tree, 'pending-plate')[0] } as never)
    expect(plate).toContain('Para responder')
    expect(plate).toContain('PARTIDA ENCONTRADA')
    expect(plate).toContain('Leões da Vila · society 7×7')
    expect(plate).toContain('1 h 30')
    expect(plate).toContain('CONVITE DE TIME')
    expect(plate).toContain('Marina Costa · Várzea Unida')
    expect(plate).toContain('sem prazo')
    expect(plate).toContain('Ver as 3 pendências')
    expect(plate).toMatch(/Para responder \| 3 \|/)
    expect(callsTo('GET', PENDING)).toHaveLength(1)
  })

  it('com 2 pendências ou menos o link diz "Ver notificações"; os dois abrem a tela no chip Para responder', async () => {
    const { tree, navigation } = await mountHome({ items: [proposal()] })
    expect(allText(tree)).toContain('Ver notificações')
    expect(allText(tree)).not.toContain('Ver as 1 pendências')
    await pressButton(tree, 'Ver notificações')
    expect(navigation.go).toHaveBeenLastCalledWith('notifications', { filter: 'responder' })
    const many = await mountHome({ items: [proposal(), invite()], summary: summaryOf({ pending_count: 4 }) })
    await pressButton(many.tree, 'Ver as 4 pendências')
    expect(many.navigation.go).toHaveBeenLastCalledWith('notifications', { filter: 'responder' })
  })

  it('tocar numa linha marca como lida, atualiza o resumo e leva à tela do aviso', async () => {
    const entry = proposal()
    const { tree, navigation, notificationSummary } = await mountHome({ items: [entry], extra: { [`PUT /me/notifications/${entry.id}/read`]: summaryOf({ pending_count: 1 }) } })
    await pressButton(tree, 'partida encontrada. Leões da Vila · society 7×7. faltam 1 h 30')
    expect(callsTo('PUT', `/me/notifications/${entry.id}/read`)).toHaveLength(1)
    expect(notificationSummary.setData).toHaveBeenCalledWith(summaryOf({ pending_count: 1 }))
    expect(navigation.go).toHaveBeenCalledWith('play', { matchId: 12 })
    // Já lida, só navega.
    const read = { ...invite(), read_at: '2026-10-13T17:00:00Z' }
    const again = await mountHome({ items: [read] })
    await pressButton(again.tree, 'convite de time. Marina Costa · Várzea Unida. sem prazo')
    expect(again.navigation.go).toHaveBeenCalledWith('teams', { teamId: 3, invites: true })
    expect(callsTo('PUT', `/me/notifications/${read.id}/read`)).toHaveLength(0)
  })

  it('sem pendências a placa some; com erro na leitura também, e o Início continua inteiro', async () => {
    const empty = await mountHome({ items: [] })
    expect(byId(empty.tree, 'pending-plate')).toHaveLength(0)
    expect(allText(empty.tree)).toContain('SEU ELO')
    const failed = await mountHome({ extra: { [PENDING]: new ApiError('Fora do ar', 500) } })
    expect(byId(failed.tree, 'pending-plate')).toHaveLength(0)
    expect(allText(failed.tree)).toContain('SEU ELO')
    expect(failed.onExpired).not.toHaveBeenCalled()
    const expired = await mountHome({ extra: { [PENDING]: new ApiError('Sessão expirada', 401) } })
    expect(expired.onExpired).toHaveBeenCalled()
  })

  it('usa o total do resumo na pílula e no link; sem resumo, as linhas lidas; o sino do Início mostra o número', async () => {
    const withoutSummary = await mountHome({ items: [proposal(), invite()], summary: null })
    expect(allText(withoutSummary.tree)).toContain('Ver notificações')
    const bell = await mountHome({ items: [], summary: summaryOf({ unread_count: 3, follow_requests_count: 1 }) })
    expect(bell.tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Notificações, 4 novas')).toHaveLength(1)
    await pressButton(bell.tree, 'Notificações, 4 novas')
    expect(bell.navigation.go).toHaveBeenLastCalledWith('notifications')
    expect(note('aviso_evento').pending).toBe(false)
  })

  it('relê as 2 pendências quando o total do resumo muda (o resumo é relido a cada minuto)', async () => {
    const navigation = navigationMock()
    serve({ [STANDINGS]: standings(), [PENDING]: { items: [proposal()] } })
    const first = notificationSummaryState(summaryOf({ pending_count: 1 }))
    const tree = await render(h(HomeScreen, { user: me, navigation, onExpired: vi.fn(), notificationSummary: first }))
    expect(callsTo('GET', PENDING)).toHaveLength(1)
    const { act } = await import('react-test-renderer')
    await act(async () => { tree.update(h(HomeScreen, { user: me, navigation, onExpired: vi.fn(), notificationSummary: notificationSummaryState(summaryOf({ pending_count: 1 })) })) })
    expect(callsTo('GET', PENDING)).toHaveLength(1)
    await act(async () => { tree.update(h(HomeScreen, { user: me, navigation, onExpired: vi.fn(), notificationSummary: notificationSummaryState(summaryOf({ pending_count: 0 })) })) })
    expect(callsTo('GET', PENDING)).toHaveLength(2)
  })
})
