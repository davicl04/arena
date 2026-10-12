import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import OrganizerEventsScreen from '../src/screens/OrganizerEventsScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { approved, card, mount, navigationMock, page, routeRequest, status } from './support/organizer'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const OPEN = '/organizer/events?scope=abertos'
const CLOSED = '/organizer/events?scope=encerrados'
const onExpired = vi.fn()
let navigation = navigationMock()
const screen = () => mount(h(OrganizerEventsScreen, { navigation: navigation as never, onExpired, params: undefined, title: 'Meus eventos' } as never))
const poster = (tree: ReactTestRenderer, prefix: string) => tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel ?? '').startsWith(prefix))

beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
})

describe('Meus eventos (O3)', () => {
  const open = [
    card({ id: 1, name: 'Copa Sudoeste', pending: { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 } }),
    card({ id: 2, name: 'Maratona da Capital', sport: 'corrida', format: null, distance_km: 10, competition_type: null, state: 'em_aprovacao', phase: 'em_aprovacao', price_cents: 8000 }),
    card({ id: 3, name: 'Rascunho do Torneio', sport: null, format: null, competition_type: null, state: 'rascunho', phase: 'rascunho', capacity: null, starts_at: null, price_cents: null }),
  ]

  it('mostra os cartazes com fase, barra de inscrições e pendências, e o "Novo evento" tracejado por último', async () => {
    routeRequest({ [OPEN]: page(open), [CLOSED]: page([]), '/me/organizer-request': approved() })
    const tree = await screen()
    expect(byLabel(tree, 'Eventos em aberto')).toHaveLength(1)
    // A placa tem a própria barra (o shell não desenha o cabeçalho): volta ao Menu e cria pelo "+".
    expect(textOf(tree)).toContain('Meus eventos')
    await press(tree, 'Voltar para o Menu')
    expect(navigation.back).toHaveBeenCalledOnce()
    expect(byLabel(tree, 'Criar evento')).toHaveLength(1)
    const text = textOf(tree)
    expect(text).toContain('Inscrições abertas')
    expect(text).toContain('Em aprovação')
    expect(text).toContain('Rascunho')
    expect(text).toContain('3 de 8 times')
    expect(poster(tree, 'Copa Sudoeste')!.props.accessibilityLabel).toContain('2 pendências')
    expect(poster(tree, 'Maratona da Capital')!.props.accessibilityLabel).not.toContain('pendência')
    // Em aprovação e rascunho não mostram a barra de inscrições.
    expect(text).not.toContain('0 de')
    const labels = tree.root.findAllByType('Pressable' as never).map(entry => entry.props.accessibilityLabel)
    expect(labels[labels.length - 1]).toBe('Novo evento')
    expect(labels.filter(label => label === 'Novo evento')).toHaveLength(1)
    expect(textOf(tree)).not.toContain('Seu primeiro evento')
  })

  it('tocar num cartaz abre a gestão; "Novo evento" e "Criar evento" abrem o assistente', async () => {
    routeRequest({ [OPEN]: page(open), [CLOSED]: page([]), '/me/organizer-request': approved() })
    const tree = await screen()
    await act(async () => { poster(tree, 'Maratona da Capital')!.props.onPress() })
    expect(navigation.go).toHaveBeenLastCalledWith('event-manage', { eventId: 2 })
    await press(tree, 'Novo evento')
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard')
    await press(tree, 'Criar evento')
    expect(navigation.go).toHaveBeenCalledTimes(3)
    expect(navigation.go).toHaveBeenLastCalledWith('event-wizard')
  })

  it('sem eventos: estado vazio com o convite para criar o primeiro', async () => {
    routeRequest({ [OPEN]: page([]), [CLOSED]: page([]), '/me/organizer-request': approved() })
    const tree = await screen()
    expect(textOf(tree)).toContain('Seu primeiro evento')
    expect(textOf(tree)).toContain('Campeonato de futebol ou tênis')
    expect(byLabel(tree, 'Novo evento')).toHaveLength(0)
    await press(tree, 'Criar evento')
    expect(navigation.go).toHaveBeenCalledWith('event-wizard')
  })

  it('quem não é organizador não cria: aviso sem os botões de criar', async () => {
    routeRequest({ [OPEN]: page([]), [CLOSED]: page([]), '/me/organizer-request': status() })
    const tree = await screen()
    expect(textOf(tree)).toContain('Você precisa ser organizador para criar eventos.')
    expect(byLabel(tree, 'Criar evento')).toHaveLength(0)
    expect(byLabel(tree, 'Novo evento')).toHaveLength(0)
  })

  it('organizador revogado mantém os eventos e perde a criação', async () => {
    routeRequest({
      [OPEN]: page([open[0]]), [CLOSED]: page([]),
      '/me/organizer-request': status({ state: 'revogado', revocation: { revoked_at: '2026-10-08T12:00:00.000Z', reason: 'Conduta' } }),
    })
    const tree = await screen()
    expect(textOf(tree)).toContain('Sua permissão de organizador foi revogada. Os eventos que a administração manteve continuam aqui.')
    expect(poster(tree, 'Copa Sudoeste')).toBeTruthy()
    expect(byLabel(tree, 'Novo evento')).toHaveLength(0)
    expect(byLabel(tree, 'Criar evento')).toHaveLength(0)
  })

  it('lista os encerrados e cancelados, paginados', async () => {
    const first = [card({ id: 10, name: 'Copa 2025', state: 'encerrado', phase: 'encerrado' }), card({ id: 11, name: 'Torneio Cancelado', state: 'cancelado', phase: 'cancelado' })]
    routeRequest({
      [OPEN]: page([open[0]]), '/me/organizer-request': approved(),
      [CLOSED]: () => page(first, 'c2'),
      [`${CLOSED}&cursor=c2`]: page([card({ id: 12, name: 'Copa 2024', state: 'encerrado', phase: 'encerrado' })]),
    })
    const tree = await screen()
    expect(textOf(tree)).toContain('Encerrados e cancelados')
    expect(byLabel(tree, 'Eventos encerrados e cancelados')).toHaveLength(1)
    expect(textOf(tree)).toContain('Cancelado')
    expect(poster(tree, 'Copa 2024')).toBeUndefined()
    await press(tree, 'Carregar mais')
    expect(poster(tree, 'Copa 2024')).toBeTruthy()
    expect(byLabel(tree, 'Carregar mais')).toHaveLength(0)
    await act(async () => { poster(tree, 'Copa 2025')!.props.onPress() })
    expect(navigation.go).toHaveBeenLastCalledWith('event-manage', { eventId: 10 })
  })

  it('erros: lista aberta com nova tentativa, encerrados com nova tentativa e 401 expira a sessão', async () => {
    routeRequest({ [OPEN]: () => { throw new ApiError('Eventos indisponíveis', 500) }, [CLOSED]: () => { throw new ApiError('Encerrados indisponíveis', 500) }, '/me/organizer-request': approved() })
    const tree = await screen()
    expect(textOf(tree)).toContain('Eventos indisponíveis')
    expect(textOf(tree)).toContain('Encerrados indisponíveis')
    expect(textOf(tree)).not.toContain('Seu primeiro evento')
    routeRequest({ [OPEN]: page([open[0]]), [CLOSED]: page([]), '/me/organizer-request': approved() })
    await act(async () => { tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === 'Tentar novamente').forEach(entry => entry.props.onPress()) })
    expect(textOf(tree)).not.toContain('indisponíveis')
    expect(poster(tree, 'Copa Sudoeste')).toBeTruthy()
    routeRequest({ [OPEN]: () => { throw new ApiError('Sessão expirada', 401) }, [CLOSED]: page([]), '/me/organizer-request': approved() })
    await screen()
    expect(onExpired).toHaveBeenCalled()
  })
})
