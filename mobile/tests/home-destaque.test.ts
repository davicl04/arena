import React from 'react'
import { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { morePendingLabel, urgencyLabel } from '../src/data/home'
import HomeScreen from '../src/screens/HomeScreen'
import { enableAct } from './support/native'
import { allText, byId, callsTo, findButton, me, navigationMock, pressButton, render, serve } from './support/events'
import { pendingNote, resetNotificationIds, summaryOf } from './support/notifications'
import { notificationSummaryState, standings } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const PENDING = '/me/notifications/pending?limit=1'
const STANDINGS = '/me/standings'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  resetNotificationIds()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 13, 15, 0, 0))
})
afterEach(() => { vi.useRealTimers() })

/** Prazo folgado: criada há 1 h, faltam 1 h 30 (60% do tempo restante). */
const proposal = () => pendingNote('proposta_partida', { match_id: 12, opponent_name: 'Leões da Vila', format: 'society' }, null, { agoH: 1, leftH: 1.5 })
/** Prazo no fim: criada há 10 h, falta 1 h (menos de 25% do tempo). */
const urgent = () => pendingNote('proposta_partida', { match_id: 14, opponent_name: 'Real Matismo', format: 'society' }, null, { agoH: 10, leftH: 1 })
const invite = () => pendingNote('convite_time', { team_id: 3, team_name: 'Várzea Unida' }, 'Marina Costa', { agoH: 2, leftH: null })
/** Pendência sem tela própria: o comprovante recusado sem `event_id` no aviso. */
const orphan = () => pendingNote('comprovante_decidido', { decision: 'recusado', event_name: 'Copa Sudoeste' }, null, { agoH: 2, leftH: null })

async function mountHome({ items = [] as unknown[], summary = summaryOf({ pending_count: items.length }) as ReturnType<typeof summaryOf> | null, extra = {} as Record<string, unknown> } = {}) {
  const navigation = navigationMock()
  const onExpired = vi.fn()
  const notificationSummary = notificationSummaryState(summary)
  serve({ [STANDINGS]: standings(), [PENDING]: { items }, ...extra })
  const tree = await render(h(HomeScreen, { user: me, navigation, onExpired, notificationSummary }))
  return { tree, navigation, onExpired, notificationSummary }
}
type Tree = Awaited<ReturnType<typeof mountHome>>['tree']
const textOf = (tree: Tree, id: string) => allText({ root: byId(tree, id)[0] } as never)
const card = (tree: Tree) => byId(tree, 'destaque-card')[0]

describe('Textos do Destaque', () => {
  it('"Mais urgente" com o prazo no fim; "Aguardando você" nos demais casos', () => {
    expect(urgencyLabel(true)).toBe('Mais urgente')
    expect(urgencyLabel(false)).toBe('Aguardando você')
  })

  it('link "+ n" só com mais de 1 pendência, no singular com 1 restante', () => {
    expect(morePendingLabel(0)).toBeNull()
    expect(morePendingLabel(1)).toBeNull()
    expect(morePendingLabel(2)).toBe('+ 1 pendência · ver todas')
    expect(morePendingLabel(3)).toBe('+ 2 pendências · ver todas')
    expect(morePendingLabel(Number.NaN)).toBeNull()
  })
})

describe('Início: Destaque "Para responder"', () => {
  it('abaixo do botão principal e antes de "Seu elo": cabeçalho com o total e só a primeira pendência da lista', async () => {
    const { tree } = await mountHome({ items: [proposal(), invite()], summary: summaryOf({ pending_count: 3 }) })
    expect(byId(tree, 'destaque')).toHaveLength(1)
    const text = allText(tree)
    expect(text.indexOf('Encontrar partida')).toBeLessThan(text.indexOf('Para responder'))
    expect(text.indexOf('Para responder')).toBeLessThan(text.indexOf('SEU ELO'))
    expect(textOf(tree, 'destaque-total')).toBe('3')
    expect(byId(tree, 'destaque-total')[0].props.accessibilityLabel).toBe('3 pendências')
    const shown = textOf(tree, 'destaque-card')
    expect(shown).toContain('Aguardando você')
    expect(shown).toContain('PARTIDA ENCONTRADA')
    expect(shown).toContain('Leões da Vila · society 7×7')
    expect(shown).toContain('faltam 1 h 30')
    expect(shown).toContain('Responder')
    expect(text).not.toContain('CONVITE DE TIME')
    // Um único botão no cartão: o "Responder" é só visual.
    expect(card(tree).findAll(node => node !== card(tree) && String(node.type) === 'Pressable')).toHaveLength(0)
    expect(card(tree).props.accessibilityLabel).toBe('Aguardando você: partida encontrada. Leões da Vila · society 7×7. faltam 1 h 30')
    expect(card(tree).props.style.borderLeftWidth).toBeUndefined()
    // A placa escura saiu do Início.
    expect(byId(tree, 'pending-plate')).toHaveLength(0)
  })

  it('pede só 1 item à lista de pendências', async () => {
    await mountHome({ items: [proposal()] })
    expect(callsTo('GET', PENDING)).toHaveLength(1)
    expect(callsTo('GET', '/me/notifications/pending?limit=2')).toHaveLength(0)
  })

  it('com o prazo no fim: "Mais urgente", prazo em âmbar e borda âmbar à esquerda', async () => {
    const { tree } = await mountHome({ items: [urgent()] })
    expect(textOf(tree, 'destaque-urgency')).toBe('Mais urgente')
    expect(textOf(tree, 'destaque-card')).toContain('faltam 1 h')
    expect(card(tree).props.style).toMatchObject({ borderLeftWidth: 3, borderLeftColor: '#d99400' })
    expect(byId(tree, 'destaque-deadline')[0].props.style.backgroundColor).toBe('#fdf3e2')
    expect(card(tree).props.accessibilityLabel).toMatch(/^Mais urgente: /)
  })

  it('sem prazo: "Aguardando você" e "sem prazo"', async () => {
    const { tree } = await mountHome({ items: [invite()] })
    expect(textOf(tree, 'destaque-urgency')).toBe('Aguardando você')
    expect(textOf(tree, 'destaque-card')).toContain('Marina Costa · Várzea Unida')
    expect(textOf(tree, 'destaque-card')).toContain('sem prazo')
  })

  it('tocar no cartão marca como lida, atualiza o resumo e leva à tela do aviso; já lida, só navega', async () => {
    const entry = proposal()
    const { tree, navigation, notificationSummary } = await mountHome({ items: [entry], extra: { [`PUT /me/notifications/${entry.id}/read`]: summaryOf({ pending_count: 1 }) } })
    await pressButton(tree, card(tree).props.accessibilityLabel)
    expect(callsTo('PUT', `/me/notifications/${entry.id}/read`)).toHaveLength(1)
    expect(notificationSummary.setData).toHaveBeenCalledWith(summaryOf({ pending_count: 1 }))
    expect(navigation.go).toHaveBeenCalledWith('play', { matchId: 12 })
    const read = { ...invite(), read_at: '2026-10-13T17:00:00Z' }
    const again = await mountHome({ items: [read] })
    await pressButton(again.tree, card(again.tree).props.accessibilityLabel)
    expect(again.navigation.go).toHaveBeenCalledWith('teams', { teamId: 3, invites: true })
    expect(callsTo('PUT', `/me/notifications/${read.id}/read`)).toHaveLength(0)
  })

  it('sem destino no aviso, marca como lida e abre as notificações no filtro Para responder (mesmo se marcar falhar)', async () => {
    const entry = orphan()
    const { tree, navigation } = await mountHome({ items: [entry], extra: { [`PUT /me/notifications/${entry.id}/read`]: summaryOf({ pending_count: 1 }) } })
    await pressButton(tree, card(tree).props.accessibilityLabel)
    expect(callsTo('PUT', `/me/notifications/${entry.id}/read`)).toHaveLength(1)
    expect(navigation.go).toHaveBeenCalledWith('notifications', { filter: 'responder' })
    const other = orphan()
    const failing = await mountHome({ items: [other], extra: { [`PUT /me/notifications/${other.id}/read`]: new ApiError('Fora do ar', 500) } })
    await pressButton(failing.tree, card(failing.tree).props.accessibilityLabel)
    expect(failing.navigation.go).toHaveBeenCalledWith('notifications', { filter: 'responder' })
  })

  it('sessão expirada ao marcar como lida encerra a sessão e não navega', async () => {
    const entry = proposal()
    const { tree, navigation, onExpired } = await mountHome({ items: [entry], extra: { [`PUT /me/notifications/${entry.id}/read`]: new ApiError('Sessão expirada', 401) } })
    await pressButton(tree, card(tree).props.accessibilityLabel)
    expect(onExpired).toHaveBeenCalled()
    expect(navigation.go).not.toHaveBeenCalled()
  })

  it('link "+ n pendências · ver todas" só com mais de 1, no singular com 2, abrindo o filtro Para responder', async () => {
    const many = await mountHome({ items: [proposal()], summary: summaryOf({ pending_count: 3 }) })
    await pressButton(many.tree, '+ 2 pendências · ver todas')
    expect(many.navigation.go).toHaveBeenLastCalledWith('notifications', { filter: 'responder' })
    expect(findButton(many.tree, '+ 2 pendências · ver todas')?.props.accessibilityLabel).toBe('Ver todas as 3 pendências')
    const two = await mountHome({ items: [proposal()], summary: summaryOf({ pending_count: 2 }) })
    expect(findButton(two.tree, '+ 1 pendência · ver todas')).toBeTruthy()
    const one = await mountHome({ items: [proposal()] })
    expect(allText(one.tree)).not.toContain('ver todas')
    expect(byId(one.tree, 'destaque')).toHaveLength(1)
  })

  it('some sem pendências (total 0, lista vazia ou sem resumo) e quando a leitura falha; o Início continua inteiro', async () => {
    const empty = await mountHome({ items: [] })
    expect(byId(empty.tree, 'destaque')).toHaveLength(0)
    expect(allText(empty.tree)).not.toContain('Para responder')
    expect(allText(empty.tree)).toContain('SEU ELO')
    const noItems = await mountHome({ items: [], summary: summaryOf({ pending_count: 2 }) })
    expect(byId(noItems.tree, 'destaque')).toHaveLength(0)
    const zero = await mountHome({ items: [proposal()], summary: summaryOf({ pending_count: 0 }) })
    expect(byId(zero.tree, 'destaque')).toHaveLength(0)
    const noSummary = await mountHome({ items: [proposal()], summary: null })
    expect(byId(noSummary.tree, 'destaque')).toHaveLength(0)
    const failed = await mountHome({ summary: summaryOf({ pending_count: 2 }), extra: { [PENDING]: new ApiError('Fora do ar', 500) } })
    expect(byId(failed.tree, 'destaque')).toHaveLength(0)
    expect(allText(failed.tree)).toContain('SEU ELO')
    expect(failed.onExpired).not.toHaveBeenCalled()
  })

  it('sessão expirada na leitura das pendências encerra a sessão pelo fluxo existente', async () => {
    const expired = await mountHome({ summary: summaryOf({ pending_count: 1 }), extra: { [PENDING]: new ApiError('Sessão expirada', 401) } })
    expect(expired.onExpired).toHaveBeenCalled()
    expect(byId(expired.tree, 'destaque')).toHaveLength(0)
  })

  it('o sino do Início mostra o número de novas e abre as notificações', async () => {
    const bell = await mountHome({ items: [], summary: summaryOf({ unread_count: 3, follow_requests_count: 1 }) })
    expect(bell.tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Notificações, 4 novas')).toHaveLength(1)
    await pressButton(bell.tree, 'Notificações, 4 novas')
    expect(bell.navigation.go).toHaveBeenLastCalledWith('notifications')
  })

  it('relê a pendência quando o total do resumo muda (o resumo é relido a cada minuto)', async () => {
    const navigation = navigationMock()
    serve({ [STANDINGS]: standings(), [PENDING]: { items: [proposal()] } })
    const props = (pendingCount: number) => ({ user: me, navigation, onExpired: vi.fn(), notificationSummary: notificationSummaryState(summaryOf({ pending_count: pendingCount })) })
    const tree = await render(h(HomeScreen, props(1)))
    expect(callsTo('GET', PENDING)).toHaveLength(1)
    await act(async () => { tree.update(h(HomeScreen, props(1))) })
    expect(callsTo('GET', PENDING)).toHaveLength(1)
    await act(async () => { tree.update(h(HomeScreen, props(2))) })
    expect(callsTo('GET', PENDING)).toHaveLength(2)
  })
})
