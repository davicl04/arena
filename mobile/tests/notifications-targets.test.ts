import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request as apiRequest } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import NotificationsScreen, { openTarget } from '../src/screens/NotificationsScreen'
import { enableAct } from './support/native'
import { allText, callsTo, me, navigationMock, page, pressButton, render, serve } from './support/events'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn().mockResolvedValue('test-token'), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
let nextId = 100
const note = (type: string, payload: Record<string, unknown> = {}, actor: ArenaNotification['actor'] = null): ArenaNotification =>
  ({ id: nextId++, type, payload, actor, created_at: new Date(Date.now() - 5 * 60_000).toISOString(), read_at: null })

beforeEach(() => {
  enableAct()
  vi.mocked(apiRequest).mockReset()
})

describe('openTarget: destinos das etapas 3 a 5', () => {
  it('a placa do Jogar leva a dica da proposta; a partida e a decisão do organizador levam o id da partida', () => {
    const navigation = navigationMock()
    openTarget(navigation, { screen: 'play' })
    openTarget(navigation, { screen: 'play', matchId: 12 })
    openTarget(navigation, { screen: 'match', matchId: 12 })
    openTarget(navigation, { screen: 'result-decision', matchId: 13 })
    expect(vi.mocked(navigation.go).mock.calls).toEqual([['play'], ['play', { matchId: 12 }], ['match', { matchId: 12 }], ['result-decision', { matchId: 13 }]])
  })

  it('o detalhe do evento abre na aba Tabela com `section`; sem ela, sem chave vazia', () => {
    const navigation = navigationMock()
    openTarget(navigation, { screen: 'event', eventId: 5, section: 'tabela' })
    openTarget(navigation, { screen: 'event', eventId: 5 })
    expect(vi.mocked(navigation.go).mock.calls).toEqual([['event', { eventId: 5, section: 'tabela' }], ['event', { eventId: 5 }]])
  })

  it('a agenda do campeonato leva a partida cuja folha abre junto; sem partida, só o evento', () => {
    const navigation = navigationMock()
    openTarget(navigation, { screen: 'event-matches', eventId: 5, matchId: 11 })
    openTarget(navigation, { screen: 'event-matches', eventId: 5 })
    expect(vi.mocked(navigation.go).mock.calls).toEqual([['event-matches', { eventId: 5, matchId: 11 }], ['event-matches', { eventId: 5 }]])
  })

  it('as filas de quadras e de W.O. da administração', () => {
    const navigation = navigationMock()
    openTarget(navigation, { screen: 'admin-court-suggestions' })
    openTarget(navigation, { screen: 'admin-walkover-disputes' })
    expect(vi.mocked(navigation.go).mock.calls).toEqual([['admin-court-suggestions'], ['admin-walkover-disputes']])
  })
})

describe('Notificações do Jogar na tela: tocar marca como lida e abre o destino', () => {
  function mountWith(list: ArenaNotification[], navigation = navigationMock(), user = me) {
    serve({
      '/me/follow-requests': page([]), '/me/notifications/unread-count': { unread_count: list.length }, '/me/notifications': page(list),
      ...Object.fromEntries(list.map(entry => [`PUT /me/notifications/${entry.id}/read`, { unread_count: 0 }])),
    })
    return render(h(NotificationsScreen, { user, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired: vi.fn(), params: undefined, title: 'Notificações' })).then(tree => ({ tree, navigation }))
  }
  const label = (_entry: ArenaNotification, text: string) => `${text}. há 5 min. Não lida`

  it('proposta e vaga abrem a placa; partida agendada e resultado, a partida; divergência de campeonato, a decisão; tabela, o evento na Tabela', async () => {
    const proposal = note('proposta_partida', { match_id: 12, opponent_name: 'Tigres do Lago' })
    const scheduled = note('partida_agendada', { match_id: 13, changed: false })
    const result = note('resultado_partida', { match_id: 14, outcome: 'confirmado', score_a: 3, score_b: 1 })
    const divergence = note('divergencia_para_decidir', { match_id: 15, event_id: 5, event_name: 'Copa Sudoeste' })
    const table = note('tabela_publicada', { event_id: 5, event_name: 'Copa Sudoeste' })
    const { tree, navigation } = await mountWith([proposal, scheduled, result, divergence, table])
    await pressButton(tree, label(proposal, 'Partida encontrada contra Tigres do Lago. Responda em até 2 h'))
    await pressButton(tree, label(scheduled, 'Partida agendada'))
    await pressButton(tree, label(result, 'Resultado confirmado: 3 × 1'))
    await pressButton(tree, label(divergence, 'Os placares de uma partida de Copa Sudoeste não batem. Decida'))
    await pressButton(tree, label(table, 'A tabela de Copa Sudoeste saiu'))
    expect(vi.mocked(navigation.go).mock.calls).toEqual([
      ['play', { matchId: 12 }], ['match', { matchId: 13 }], ['match', { matchId: 14 }], ['result-decision', { matchId: 15 }], ['event', { eventId: 5, section: 'tabela' }],
    ])
    for (const entry of [proposal, scheduled, result, divergence, table]) expect(callsTo('PUT', `/me/notifications/${entry.id}/read`)).toHaveLength(1)
  })

  it('W.O. contestado leva a administração à fila; quem registrou, à partida', async () => {
    const contested = note('wo_contestado', { match_id: 12, reason: 'Estávamos lá.' }, { id: 9, name: 'Caio Ramos', username: 'caio', avatar_url: null })
    const asAdmin = await mountWith([contested], navigationMock(), { ...me, is_admin: true })
    await pressButton(asAdmin.tree, label(contested, 'Caio Ramos contestou o W.O.'))
    expect(vi.mocked(asAdmin.navigation.go).mock.calls).toEqual([['admin-walkover-disputes']])
    const plain = await mountWith([contested])
    await pressButton(plain.tree, label(contested, 'Caio Ramos contestou o W.O.'))
    expect(vi.mocked(plain.navigation.go).mock.calls).toEqual([['match', { matchId: 12 }]])
  })

  it('aviso sem destino (quadra decidida, removido da partida) só marca como lido e não navega', async () => {
    const court = note('quadra_decidida', { court_id: 3, court_name: 'Arena Sul', decision: 'publicada' })
    const removed = note('removido_da_partida', { match_id: 12, team_name: 'Ferrugem FC' })
    const { tree, navigation } = await mountWith([court, removed])
    expect(allText(tree)).toContain('Arena Sul entrou no catálogo')
    await pressButton(tree, label(court, 'Arena Sul entrou no catálogo'))
    await pressButton(tree, label(removed, 'Você foi removido da partida do Ferrugem FC'))
    expect(navigation.go).not.toHaveBeenCalled()
    expect(callsTo('PUT', `/me/notifications/${court.id}/read`)).toHaveLength(1)
  })

  it('o vazio cita propostas e partidas', async () => {
    const { tree } = await mountWith([])
    expect(allText(tree)).toContain('Convites e pedidos dos seus times, propostas e partidas, inscrições em campeonatos e provas e as respostas da administração aparecem aqui.')
  })
})
