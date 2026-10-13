import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Championship, NextActionKind, OrganizerEventCard } from '../src/api/events'
import { OrganizerEvents } from '../src/components/organizer/OrganizerCard'
import { alertCount } from '../src/components/organizer/eventView'
import EventManageScreen from '../src/screens/EventManageScreen'
import OrganizerEventsScreen from '../src/screens/OrganizerEventsScreen'
import { enableAct, press, textOf } from './support/native'
import { approved, card, detail, mount, navigationMock, noPending, page, routeRequest } from './support/organizer'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

/*
 * Gestão do evento (G3) no campeonato: as seções Chaveamento (ou Tabela) e Partidas com os contadores do cartaz, o cartão
 * "Agora" com os cinco tipos novos e o alerta do cartaz (comprovantes e devoluções mais os jogos para agendar e decidir).
 */

const h = React.createElement
const EVENT = '/organizer/events/5'
const OPEN = '/organizer/events?scope=abertos'
const CLOSED = '/organizer/events?scope=encerrados'
const onExpired = vi.fn()
let navigation = navigationMock()

const screen = () => mount(h(EventManageScreen, { navigation: navigation as never, onExpired, params: { eventId: 5 }, title: 'Gestão do evento' } as never))
const counts = (over: Partial<Championship> = {}): Championship => ({
  bracket: 'sem_chaveamento', confirmed: 0, matches_total: 0, to_schedule: 0, waiting: 0, scheduled: 0, to_decide: 0, finished: 0, attention: 0, ...over,
})
const closedPhase = { phase: 'inscricoes_encerradas' as const, registration_closes_at: '2026-10-05T02:59:00.000Z', registration_deadline: '2026-10-05T02:59:00.000Z' }
/** Evento publicado com as inscrições encerradas e a próxima ação dada. */
const event = (kind: NextActionKind, count: number | null, championship: Championship | null, over: Record<string, unknown> = {}) => detail({
  ...closedPhase, competition_type: 'eliminacao_simples', next_action: { kind, count, deadline: null }, championship, ...over,
})
const section = (tree: ReactTestRenderer, title: string) => tree.root.findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel ?? '').startsWith(`${title}, `))[0]
const labelOf = (tree: ReactTestRenderer, title: string) => String(section(tree, title).props.accessibilityLabel)

beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
})

describe('cartão "Agora" do campeonato', () => {
  it('sortear_chaveamento: conta as confirmadas e abre o chaveamento', async () => {
    routeRequest({ [EVENT]: event('sortear_chaveamento', 6, counts({ confirmed: 6 })), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('AGORA')
    expect(textOf(tree)).toContain('Sorteie o chaveamento')
    expect(textOf(tree)).toContain('6 inscrições confirmadas. Depois do sorteio você confere o chaveamento e confirma para os times verem.')
    await press(tree, 'Sortear chaveamento')
    expect(navigation.go).toHaveBeenCalledWith('event-bracket', { eventId: 5 })
    // A seção do chaveamento fica pronta para abrir; as partidas esperam o sorteio.
    expect(labelOf(tree, 'Chaveamento')).toContain('Pronto para sortear · 6 confirmados')
    expect(section(tree, 'Chaveamento').props.accessibilityState).toBeUndefined()
    await press(tree, labelOf(tree, 'Chaveamento'))
    expect(navigation.go).toHaveBeenLastCalledWith('event-bracket', { eventId: 5 })
    expect(section(tree, 'Partidas').props.accessibilityState).toMatchObject({ disabled: true })
    expect(labelOf(tree, 'Partidas')).toContain('Depois do sorteio')
  })

  it('todos contra todos: "Sorteie as rodadas" e a seção se chama Tabela', async () => {
    routeRequest({ [EVENT]: event('sortear_chaveamento', 5, counts({ confirmed: 5 }), { competition_type: 'todos_contra_todos' }), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('Sorteie as rodadas')
    expect(textOf(tree)).toContain('Depois do sorteio você confere a tabela e confirma')
    await press(tree, 'Sortear rodadas')
    expect(navigation.go).toHaveBeenCalledWith('event-bracket', { eventId: 5 })
    expect(labelOf(tree, 'Tabela')).toContain('Pronto para sortear · 5 confirmados')
    expect(section(tree, 'Chaveamento')).toBeUndefined()
  })

  it('confirmar_chaveamento: o sorteio está feito e só o organizador vê', async () => {
    routeRequest({ [EVENT]: event('confirmar_chaveamento', null, counts({ bracket: 'sorteado', confirmed: 6 })), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('Confirme o chaveamento')
    expect(textOf(tree)).toContain('O sorteio está feito: só você vê o chaveamento.')
    await press(tree, 'Revisar e confirmar')
    expect(navigation.go).toHaveBeenCalledWith('event-bracket', { eventId: 5 })
    expect(labelOf(tree, 'Chaveamento')).toContain('Sorteio feito · falta confirmar')
    expect(labelOf(tree, 'Partidas')).toContain('Depois de confirmar o chaveamento')
  })

  it('agendar_partidas: os contadores do cartaz nas partidas e o botão leva à lista', async () => {
    const champ = counts({ bracket: 'confirmado', confirmed: 6, matches_total: 7, to_schedule: 3, waiting: 3, finished: 1, attention: 3 })
    routeRequest({ [EVENT]: event('agendar_partidas', 3, champ, { state: 'em_andamento', phase: 'em_andamento' }), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('3 partidas para agendar')
    expect(textOf(tree)).toContain('Escolha data, horário e quadra de cada jogo. Os dois elencos são avisados.')
    await press(tree, 'Agendar')
    expect(navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5 })
    expect(labelOf(tree, 'Partidas')).toBe('Partidas, 3 para agendar · 3 esperando · 1 de 7 encerradas')
    expect(labelOf(tree, 'Chaveamento')).toBe('Chaveamento, Confirmado · 7 jogos')
    await press(tree, labelOf(tree, 'Partidas'))
    expect(navigation.go).toHaveBeenLastCalledWith('event-matches', { eventId: 5 })
    await press(tree, labelOf(tree, 'Chaveamento'))
    expect(navigation.go).toHaveBeenLastCalledWith('event-bracket', { eventId: 5 })
  })

  it('decidir_divergencias: "N partidas para decidir" aparece antes de agendar e a seção as conta', async () => {
    const champ = counts({ bracket: 'confirmado', confirmed: 6, matches_total: 7, to_schedule: 1, to_decide: 2, scheduled: 1, attention: 3 })
    routeRequest({ [EVENT]: event('decidir_divergencias', 2, champ, { state: 'em_andamento', phase: 'em_andamento' }), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('2 partidas para decidir')
    expect(textOf(tree)).toContain('Os placares não batem ou o prazo de 48 h passou sem resultado.')
    expect(textOf(tree)).not.toContain('para agendar.')
    await press(tree, 'Decidir')
    expect(navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5 })
    expect(labelOf(tree, 'Partidas')).toBe('Partidas, 2 para decidir · 1 para agendar · 1 agendada')
  })

  it('acompanhar_partidas: com agendadas conta; só com jogos esperando, diz que estão em andamento', async () => {
    const running = { state: 'em_andamento' as const, phase: 'em_andamento' as const }
    routeRequest({ [EVENT]: event('acompanhar_partidas', 2, counts({ bracket: 'confirmado', matches_total: 7, scheduled: 2, waiting: 4, finished: 1 }), running), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('2 partidas agendadas')
    expect(textOf(tree)).toContain('Os times informam o placar depois do jogo; você decide se os placares não baterem.')
    await press(tree, 'Ver partidas')
    expect(navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5 })
    routeRequest({ [EVENT]: event('acompanhar_partidas', 0, counts({ bracket: 'confirmado', matches_total: 3, waiting: 3 }), running), '/events/5/messages': page([]) })
    const waiting = await screen()
    expect(textOf(waiting)).toContain('Partidas em andamento')
    expect(textOf(waiting)).toContain('Os jogos que faltam esperam o resultado dos anteriores.')
    expect(labelOf(waiting, 'Partidas')).toBe('Partidas, 3 esperando')
  })

  it('evento encerrado: o chaveamento e as partidas seguem acessíveis, com os jogos encerrados', async () => {
    routeRequest({
      [EVENT]: event('nenhuma', null, counts({ bracket: 'confirmado', matches_total: 7, finished: 7 }), { state: 'encerrado', phase: 'encerrado', editable_fields: [] }),
      '/events/5/messages': page([]),
    })
    const tree = await screen()
    expect(textOf(tree)).toContain('Evento encerrado')
    expect(labelOf(tree, 'Partidas')).toBe('Partidas, 7 de 7 encerradas')
    await press(tree, labelOf(tree, 'Partidas'))
    expect(navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5 })
  })

  it('sem sorteio possível (menos de 2 confirmadas), continua aguardando e explica', async () => {
    routeRequest({ [EVENT]: event('aguardar_inicio', null, counts({ confirmed: 1 })), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(textOf(tree)).toContain('Com pelo menos 2 inscrições confirmadas, você pode sortear o chaveamento.')
    expect(labelOf(tree, 'Chaveamento')).toContain('Confirme pelo menos 2 inscrições')
    expect(section(tree, 'Chaveamento').props.accessibilityState).toMatchObject({ disabled: true })
    expect(textOf(tree)).not.toContain('Sorteie o chaveamento')
  })

  it('com as inscrições abertas, as seções do campeonato esperam o fim das inscrições', async () => {
    routeRequest({ [EVENT]: detail({ competition_type: 'eliminacao_simples', championship: counts({ confirmed: 2 }) }), '/events/5/messages': page([]) })
    const tree = await screen()
    expect(labelOf(tree, 'Chaveamento')).toContain('Depois das inscrições')
    expect(labelOf(tree, 'Partidas')).toContain('Depois das inscrições')
    expect(section(tree, 'Chaveamento').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('sem o contador do cartaz (corrida ou rascunho), as seções ficam como antes', async () => {
    routeRequest({ [EVENT]: detail({ sport: 'corrida', format: null, competition_type: null, distance_km: 10, championship: null }), '/events/5/messages': page([]) })
    const run = await screen()
    expect(textOf(run)).toContain('Resultados')
    expect(section(run, 'Resultados').props.accessibilityState).toMatchObject({ disabled: true })
    expect(section(run, 'Partidas')).toBeUndefined()
    expect(section(run, 'Chaveamento')).toBeUndefined()
  })
})

describe('alerta do cartaz', () => {
  const posterWith = (over: Partial<OrganizerEventCard> = {}) => card({ pending: { ...noPending, receipts: 2, total: 2 }, ...over })

  it('soma os comprovantes e devoluções aos jogos para agendar e decidir', () => {
    expect(alertCount(posterWith())).toBe(2)
    expect(alertCount(posterWith({ championship: counts({ attention: 4 }) }))).toBe(6)
    expect(alertCount(posterWith({ championship: null }))).toBe(2)
    expect(alertCount({ pending: { total: 0 } })).toBe(0)
  })

  it('Meus eventos mostra a soma no cartaz', async () => {
    routeRequest({
      [OPEN]: page([
        posterWith({ id: 1, name: 'Copa Sudoeste', championship: counts({ bracket: 'confirmado', attention: 3 }) }),
        card({ id: 2, name: 'Copa Norte', championship: counts({ bracket: 'confirmado', attention: 1 }) }),
      ]),
      [CLOSED]: page([]), '/me/organizer-request': approved(),
    })
    const tree = await mount(h(OrganizerEventsScreen, { navigation: navigation as never, onExpired, params: undefined, title: 'Meus eventos' } as never))
    const poster = (prefix: string) => tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel ?? '').startsWith(prefix))
    expect(poster('Copa Sudoeste')!.props.accessibilityLabel).toContain('5 pendências')
    expect(poster('Copa Norte')!.props.accessibilityLabel).toContain('1 pendência')
    expect(poster('Copa Norte')!.props.accessibilityLabel).not.toContain('1 pendências')
  })

  it('o Menu soma as pendências e os jogos dos eventos em aberto', async () => {
    const events = [posterWith({ id: 1, championship: counts({ attention: 3 }) }), card({ id: 2, name: 'Copa Norte', championship: counts({ attention: 2 }) })]
    const tree = await mount(h(OrganizerEvents, {
      status: approved(), events, loading: false, error: '', onReload: vi.fn(), onOpenList: vi.fn(), onOpenEvent: vi.fn(), onCreate: vi.fn(),
    }))
    await act(async () => { await Promise.resolve() })
    expect(textOf(tree)).toContain('Meus eventos')
    expect(tree.root.findAllByType('Pressable' as never).some(entry => String(entry.props.accessibilityLabel ?? '').includes('2 eventos em aberto · 7 pendências'))).toBe(true)
  })
})
