import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import type { MatchDetail } from '../src/api/matches'
import ArenaShell from '../src/screens/ArenaShell'
import { dayLabel } from '../src/utils/calendar'
import { combineDateTime } from '../src/utils/dateKey'
import { confirmed, eightTeams, eliminationBracket, matchList, row } from './support/brackets'
import { enableAct } from './support/native'
import { approved, card, detail as organizerDetail, page } from './support/organizer'
import { eventDetail, myEntry, team } from './support/events'
import { court, ferrugemRef, fromNow, leoesRef, matchCard, matchDetail, messagePage, noPermissions, sides, teamSide } from './support/play'
import { confirmed as confirmedResult, report, result as resultOf } from './support/results'
import { allText, bodyOf, byId, callsTo, findByPrefix, flush, me, pressButton, pressPrefix, serve, typeInto } from './support/review'
import type { Route } from './support/review'
import { toastText } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
// Telas que carregam módulos nativos do Expo e não entram neste fluxo (a Comunidade, o Perfil, Meus times e o perfil de outro atleta).
vi.mock('../src/screens/CommunityScreen', () => ({ default: () => null }))
vi.mock('../src/screens/ProfileScreen', () => ({ default: () => null }))
vi.mock('../src/screens/TeamsScreen', () => ({ default: () => null }))
vi.mock('../src/screens/UserProfileScreen', () => ({ default: () => null }))

/*
 * Campeonato pelo shell, sem sósias: a gestão do evento (G3) leva ao Chaveamento (confirmar) e às Partidas (agendar), a
 * partida do campeonato leva à decisão do organizador (D3), e a notificação de divergência abre a decisão. Cada volta relê
 * a tela de origem, que mostra o que mudou.
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []
const EVENT = '/organizer/events/5'
const ORG_BRACKET = '/organizer/events/5/bracket'
const MATCHES = '/organizer/events/5/matches'
const courtsOf = (id: number) => `/courts?city_id=7&kind=society&match_id=${id}`

const counts = (over: Record<string, unknown>) => ({ bracket: 'sem_chaveamento', confirmed: 8, matches_total: 0, to_schedule: 0, waiting: 0, scheduled: 0, to_decide: 0, finished: 0, attention: 0, ...over })
const closed = { phase: 'inscricoes_encerradas' as const, registration_closes_at: '2026-10-05T02:59:00.000Z', registration_deadline: '2026-10-05T02:59:00.000Z' }
/** Evento publicado em eliminação simples, com a próxima ação e os contadores do campeonato dados. */
const eventAt = (kind: string, count: number | null, championship: ReturnType<typeof counts>, over: Record<string, unknown> = {}) =>
  organizerDetail({ ...closed, competition_type: 'eliminacao_simples', next_action: { kind, count, deadline: null }, championship, ...over } as never)

/** Rotas-padrão do shell até a gestão do evento: Início, lista do organizador e o chat de avisos; `extra` acrescenta. */
const base = (event: () => unknown, extra: Record<string, Route> = {}): Record<string, Route> => ({
  '/me/play': { attention: false, searches: [], proposals: [], offers: [], matches: [] },
  '/me/standings': { items: [], next_cursor: null },
  '/me/notifications/unread-count': { unread_count: 0 },
  '/me/organizer-request': approved(),
  '/organizer/events?scope=abertos': () => page([card({ id: 5, name: 'Copa Sudoeste', competition_type: 'eliminacao_simples' })]),
  '/organizer/events?scope=encerrados': page([]),
  [EVENT]: event,
  '/events/5/messages': page([]),
  ...extra,
})

async function mountShell(routes: Record<string, Route>) {
  serve(routes)
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(ArenaShell, { user: me, onUser: vi.fn(), onLogout: vi.fn(), onExpired: vi.fn() })) })
  trees.push(tree)
  await flush()
  return tree
}
/** Início → Meus eventos → cartaz do evento: a gestão (G3). */
async function openManagement(tree: ReactTestRenderer) {
  await pressButton(tree, 'Meus eventos')
  await pressPrefix(tree, 'Copa Sudoeste')
}

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
  // Só a data é simulada (12/10/2026, 10:00); os temporizadores e as promessas seguem reais.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => { tree.unmount() })
  vi.useRealTimers()
})

describe('G3 → Chaveamento', () => {
  it('revisar e confirmar o sorteio: a gestão de volta relê o evento e mostra o chaveamento confirmado', async () => {
    const world = { confirmed: false }
    const drawn = eliminationBracket(eightTeams)
    const tree = await mountShell(base(
      () => (world.confirmed
        ? eventAt('agendar_partidas', 4, counts({ bracket: 'confirmado', matches_total: 7, to_schedule: 4, waiting: 3, attention: 4 }), { state: 'em_andamento', phase: 'em_andamento' })
        : eventAt('confirmar_chaveamento', null, counts({ bracket: 'sorteado' }))),
      {
        '/events/5/bracket': () => (world.confirmed ? confirmed(drawn) : drawn),
        [`POST ${ORG_BRACKET}/confirm`]: () => { world.confirmed = true; return confirmed(drawn) },
      },
    ))
    await openManagement(tree)
    expect(allText(tree)).toContain('Confirme o chaveamento')
    expect(findByPrefix(tree, 'Chaveamento, Sorteio feito')).toBeTruthy()
    await pressButton(tree, 'Revisar e confirmar')
    expect(allText(tree)).toContain('Eliminação simples · chave de 8')
    await pressButton(tree, 'Confirmar chaveamento')
    await pressButton(tree, 'Confirmar')
    expect(bodyOf('POST', `${ORG_BRACKET}/confirm`)).toEqual({})
    expect(toastText()).toContain('Chaveamento confirmado. As partidas foram criadas e os times foram avisados.')
    const reads = callsTo('GET', EVENT).length
    await pressButton(tree, 'Voltar')
    // A gestão volta relida: o chaveamento está confirmado e a próxima ação é agendar.
    expect(callsTo('GET', EVENT).length).toBe(reads + 1)
    expect(findByPrefix(tree, 'Chaveamento, Confirmado')).toBeTruthy()
    expect(allText(tree)).toContain('4 partidas para agendar')
  })
})

describe('G3 → Partidas', () => {
  it('agendar um jogo: a lista relê, a folha fecha e a gestão de volta mostra o jogo agendado', async () => {
    const startsAt = combineDateTime('2026-10-20', '19:07')!
    const world = { scheduled: false }
    const unscheduled = () => row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'])
    const done = () => row('J1', 1, ['Novo Horizonte', 'Bola Murcha FC'], {}, { state: 'agendada', phase: 'agendada', starts_at: startsAt, court: court() })
    const waiting = () => row('J2', 2, [null, null], { can_schedule: false, round_number: 2, stage: 'Semifinal' })
    const tree = await mountShell(base(
      () => (world.scheduled
        ? eventAt('acompanhar_partidas', null, counts({ bracket: 'confirmado', matches_total: 2, scheduled: 1, waiting: 1, attention: 0 }), { state: 'em_andamento', phase: 'em_andamento' })
        : eventAt('agendar_partidas', 1, counts({ bracket: 'confirmado', matches_total: 2, to_schedule: 1, waiting: 1, attention: 1 }), { state: 'em_andamento', phase: 'em_andamento' })),
      {
        [MATCHES]: () => matchList(world.scheduled ? [done(), waiting()] : [unscheduled(), waiting()]),
        [courtsOf(1)]: { items: [court()] },
        [`PUT /organizer/matches/1/schedule`]: () => { world.scheduled = true; return done() },
      },
    ))
    await openManagement(tree)
    expect(allText(tree)).toContain('1 partida para agendar')
    await pressButton(tree, 'Agendar')
    expect(callsTo('GET', MATCHES)).toHaveLength(1)
    await pressPrefix(tree, 'J1, ')
    expect(allText(tree)).toContain('Agendar J1')
    await pressButton(tree, 'Data da partida: não escolhida')
    await pressButton(tree, dayLabel(new Date(2026, 9, 20)))
    await typeInto(tree, 'Horário de início', '1907')
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Agendar')
    expect(bodyOf('PUT', '/organizer/matches/1/schedule')).toEqual({ starts_at: startsAt, court_id: 7 })
    expect(allText(tree)).not.toContain('Agendar J1')
    expect(allText(tree)).toContain('J1 agendado para')
    expect(callsTo('GET', MATCHES)).toHaveLength(2)
    await pressButton(tree, 'Voltar')
    const sections = findByPrefix(tree, 'Partidas, ')
    expect(String(sections?.props.accessibilityLabel)).toContain('1 agendada')
    expect(allText(tree)).not.toContain('1 partida para agendar')
  })
})

describe('Partida do campeonato → Decidir resultado', () => {
  const MATCH = '/matches/7'
  const DECIDE = '/organizer/matches/7/result-decision'
  const organizer = { ...noPermissions, read_chat: true, decide_result: true }
  const duel = sides({ is_mine: false })
  const divergent = (): MatchDetail => matchDetail({
    id: 7, origin: 'campeonato', my_side: null, my_role: 'organizador', event: { id: 5, name: 'Copa Sudoeste' }, round_number: 1, sides: duel,
    state: 'agendada', phase: 'divergente', starts_at: fromNow(-3), permissions: organizer,
    result: resultOf({ state: 'divergente', reports: { a: report('a', 2, 1), b: report('b', 1, 2) } }),
  })
  const decided = (): MatchDetail => ({
    ...divergent(), state: 'encerrada', phase: 'encerrada', permissions: { ...noPermissions, read_chat: true },
    result: confirmedResult(2, 1, null, { source: 'organizador', decision_reason: 'O vídeo mostra o gol antes do apito final.' }),
  })
  const world = { decided: false }
  const routes = (extra: Record<string, Route> = {}): Record<string, Route> => ({
    ...base(() => organizerDetail()),
    '/me/play': { attention: false, searches: [], proposals: [], offers: [], matches: [matchCard({ id: 7, origin: 'campeonato', my_side: null, my_role: 'organizador', sides: sides(teamSide('a', ferrugemRef), teamSide('b', leoesRef)), state: 'agendada', phase: 'divergente', starts_at: fromNow(-3) })] },
    '/me/sports-profiles': [], '/cities': [],
    [MATCH]: () => (world.decided ? decided() : divergent()),
    [`${MATCH}/messages`]: messagePage([]),
    '/matches/7/messages?limit=20': messagePage([]),
    [`POST ${DECIDE}`]: () => { world.decided = true; return decided() },
    ...extra,
  })
  beforeEach(() => { world.decided = false })

  it('a partida leva à decisão; ao registrar, a volta relê a partida e mostra o resultado do organizador', async () => {
    const tree = await mountShell(routes())
    await pressButton(tree, 'JOGAR')
    await act(async () => { byId(tree, 'match-row')[0].props.onPress() })
    await flush()
    expect(allText(tree)).toContain('Placares diferentes')
    await pressButton(tree, 'Decidir resultado')
    // A tela de decisão: os dois placares informados como escolhas e a justificativa obrigatória.
    expect(allText(tree)).toContain('A partida aguarda a sua decisão')
    await act(async () => {
      tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Placar informado por Ferrugem FC: 2 × 1')[0].props.onPress()
    })
    await typeInto(tree, 'Justificativa (obrigatória)', 'O vídeo mostra o gol antes do apito final.')
    const reads = callsTo('GET', MATCH).length
    await pressButton(tree, 'Registrar 2 × 1')
    expect(bodyOf('POST', DECIDE)).toEqual({ score: { goals_a: 2, goals_b: 1 }, justification: 'O vídeo mostra o gol antes do apito final.' })
    await flush()
    // A partida volta relida: o resultado agora é o do organizador, com a justificativa.
    expect(callsTo('GET', MATCH).length).toBeGreaterThan(reads)
    expect(allText(tree)).toContain('O organizador decidiu o resultado.')
    expect(allText(tree)).toContain('O vídeo mostra o gol antes do apito final.')
    expect(allText(tree)).not.toContain('A partida aguarda a sua decisão')
  })

  it('a notificação "divergencia_para_decidir" abre a decisão real; registrar volta às notificações', async () => {
    const notification = { id: 31, type: 'divergencia_para_decidir', payload: { match_id: 7, event_id: 5, event_name: 'Copa Sudoeste', deadline: null }, actor: null, created_at: new Date(Date.now() - 5 * 60_000).toISOString(), read_at: null }
    const tree = await mountShell(routes({
      '/me/notifications': page([notification]),
      '/me/follow-requests': page([]),
      'PUT /me/notifications/31/read': { unread_count: 0 },
    }))
    await pressButton(tree, 'Notificações')
    await pressPrefix(tree, 'Os placares de uma partida de Copa Sudoeste não batem')
    // A decisão do organizador: a placa traz o evento, o placar divergente e o pedido de decisão.
    expect(allText(tree)).toContain('Copa Sudoeste')
    expect(allText(tree)).toContain('A partida aguarda a sua decisão')
    await act(async () => {
      tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Placar informado por Ferrugem FC: 2 × 1')[0].props.onPress()
    })
    await typeInto(tree, 'Justificativa (obrigatória)', 'O vídeo mostra o gol antes do apito final.')
    await pressPrefix(tree, 'Registrar ')
    expect(callsTo('POST', DECIDE)).toHaveLength(1)
    await flush()
    expect(allText(tree)).toContain('Notificações')
    expect(allText(tree)).not.toContain('A partida aguarda a sua decisão')
  })

  it('"tabela_publicada" abre o detalhe do evento na aba Tabela', async () => {
    const notification = { id: 32, type: 'tabela_publicada', payload: { event_id: 5, event_name: 'Copa Sudoeste' }, actor: null, created_at: new Date(Date.now() - 5 * 60_000).toISOString(), read_at: null }
    const entry = myEntry({ state: 'confirmada', can_cancel: false, can_send_receipt: false })
    const published = confirmed(eliminationBracket(eightTeams, { is_organizer: false }))
    const tree = await mountShell(routes({
      '/me/notifications': page([notification]),
      '/me/follow-requests': page([]),
      'PUT /me/notifications/32/read': { unread_count: 0 },
      '/events/5': { ...eventDetail({ competition_type: 'eliminacao_simples' }), my_entry: { id: entry.id, state: entry.state, team, reserved_until: entry.reserved_until } },
      '/events/5/entries': page([]),
      '/events/5/bracket': published,
    }))
    await pressButton(tree, 'Notificações')
    expect(callsTo('GET', '/events/5/bracket')).toHaveLength(0)
    await pressPrefix(tree, 'A tabela de Copa Sudoeste saiu')
    // O detalhe do evento abre já na aba Tabela: a árvore é lida e os confrontos aparecem.
    expect(callsTo('GET', '/events/5/bracket')).toHaveLength(1)
    expect(allText(tree)).toContain('Quartas de final')
  })
})
