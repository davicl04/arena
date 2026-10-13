import React from 'react'
import { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { MatchCard } from '../src/api/matches'
import type { MeStandings, RunStanding, StandingLine } from '../src/api/play'
import { modalityStanding } from '../src/components/arena/modalityStanding'
import HomeScreen from '../src/screens/HomeScreen'
import { enableAct } from './support/native'
import { admin, allText, byId, callsTo, findButton, me, navigationMock, pressButton, render, serve } from './support/review'
import { emptySummary, ferrugemRef, fromNow, leoesRef, matchCard, notificationSummaryState, sides, standings, teamSide } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const STANDINGS = '/me/standings'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

const ranked = (tier: NonNullable<StandingLine['tier']>, metric: number, extra: Partial<StandingLine> = {}): StandingLine =>
  ({ state: 'ranqueado', tier, played: 5, required: 3, rank_position: 4, metric_value: metric, faces: ['prata', 'ouro'], faces_any_level: false, ...extra })
const placement = (played: number, extra: Partial<StandingLine> = {}): StandingLine =>
  ({ state: 'classificacao', tier: null, played, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true, ...extra })
const run = (distance_km: RunStanding['distance_km'], line: Partial<RunStanding>): RunStanding =>
  ({ state: 'sem_marca', tier: null, played: 0, required: 1, rank_position: null, metric_value: null, faces: [], faces_any_level: true, distance_km, ...line })

/** Standings sem jogos com as linhas dadas no lugar das vazias. */
function withLines(lines: { society?: StandingLine; tenis?: StandingLine; corrida?: RunStanding[] }): MeStandings {
  const base = standings([{ team: ferrugemRef, role: 'representante' }])
  return {
    ...base,
    futebol: {
      ...base.futebol,
      teams: base.futebol.teams.map(team => ({ ...team, formats: team.formats.map(format => (format.format === 'society' && lines.society ? { ...format, ...lines.society, format: 'society' as const, state: lines.society.state as 'ranqueado' } : format)) })),
    },
    tenis: lines.tenis ?? base.tenis,
    corrida: base.corrida.map(item => lines.corrida?.find(line => line.distance_km === item.distance_km) ?? item),
  }
}

const noSummary = () => notificationSummaryState(emptySummary())

function mount(data: unknown, options: { unread?: number; user?: typeof me; matches?: MatchCard[] } = {}) {
  const navigation = navigationMock()
  const onExpired = vi.fn()
  serve({ [STANDINGS]: data })
  const notificationSummary = notificationSummaryState(emptySummary({ unread_count: options.unread ?? 0 }))
  return render(h(HomeScreen, { user: options.user ?? me, navigation, onExpired, matches: options.matches, notificationSummary })).then(tree => ({ tree, navigation, onExpired }))
}
const card = (tree: Awaited<ReturnType<typeof mount>>['tree'], sport: string) => allText({ root: byId(tree, `modality-${sport}`).find(node => typeof node.type === 'string')! } as never)

describe('Início: "Seu elo" por modalidade', () => {
  it('sem jogos: classificação "0 de 3 partidas", sem elo nem pontos, e a corrida "Sem marca"', async () => {
    const { tree } = await mount(standings())
    expect(allText(tree)).toContain('SEU ELO')
    expect(card(tree, 'futebol')).toContain('0 de 3 partidas')
    expect(card(tree, 'futebol')).toContain('3 partidas confirmadas definem o seu elo.')
    expect(card(tree, 'tenis')).toContain('0 de 3 partidas')
    expect(card(tree, 'corrida')).toContain('Sem marca')
    expect(card(tree, 'corrida')).toContain('A primeira marca já define o seu elo.')
    expect(card(tree, 'futebol')).toContain('—')
    expect(allText(tree)).not.toMatch(/Bronze|Prata|Ouro|Diamante|Lendário/)
    expect(byId(tree, 'modality-futebol')).not.toHaveLength(0)
  })

  it('ranqueado: o elo com o nome, a pontuação e onde ele vale; o tênis em classificação mostra "n de 3" e o que falta', async () => {
    const { tree } = await mount(withLines({ society: ranked('ouro', 38), tenis: placement(2) }))
    const football = card(tree, 'futebol')
    expect(football).toContain('Ouro')
    expect(football).toContain('38')
    expect(football).toContain('pontos')
    expect(football).toContain('Society · Ferrugem FC')
    const tennis = card(tree, 'tenis')
    expect(tennis).toContain('2 de 3 partidas')
    expect(tennis).toContain('Falta 1 partida para o seu elo.')
    expect(tennis).not.toMatch(/Bronze|Prata|Ouro|Diamante|Lendário/)
  })

  it('classificação com 1 partida pede as duas que faltam', async () => {
    const { tree } = await mount(withLines({ tenis: placement(1) }))
    expect(card(tree, 'tenis')).toContain('Faltam 2 partidas para o seu elo.')
  })

  it('corrida: a distância de maior elo e o melhor tempo dela; "Ver ranking" abre o Ranking nessa distância', async () => {
    const { tree, navigation } = await mount(withLines({ corrida: [
      run(5, { state: 'ranqueado', tier: 'ouro', played: 3, rank_position: 6, metric_value: 1452 }),
      run(21, { state: 'ranqueado', tier: 'diamante', played: 1, rank_position: 2, metric_value: 6330 }),
    ] }))
    const running = card(tree, 'corrida')
    expect(running).toContain('Diamante')
    expect(running).toContain('1:45:30')
    expect(running).toContain('melhor tempo')
    expect(running).toContain('Nos 21 km')
    await pressButton(tree, 'Ver ranking de Corrida')
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'corrida', distanceKm: 21 })
    await pressButton(tree, 'Ver ranking de Futebol')
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'futebol' })
    await pressButton(tree, 'Ver elos no Ranking')
    expect(navigation.go).toHaveBeenLastCalledWith('ranking')
  })

  it('nunca atribui elo a quem está em classificação, mesmo que a resposta traga a chave', async () => {
    const { tree } = await mount(withLines({ tenis: placement(2, { tier: 'ouro', metric_value: 30 }) }))
    expect(card(tree, 'tenis')).toContain('2 de 3 partidas')
    expect(card(tree, 'tenis')).not.toContain('Ouro')
    expect(card(tree, 'tenis')).toContain('—')
  })

  it('falha ao ler a classificação: "Classificação indisponível" sem inventar números; 401 expira a sessão', async () => {
    const failing = vi.fn()
    serve({ [STANDINGS]: new ApiError('Não foi possível carregar os dados.', 500) })
    const tree = await render(h(HomeScreen, { user: me, navigation: navigationMock(), onExpired: failing, notificationSummary: noSummary() }))
    expect(card(tree, 'futebol')).toContain('Classificação indisponível')
    expect(card(tree, 'futebol')).toContain('—')
    expect(failing).not.toHaveBeenCalled()
    const expired = vi.fn()
    serve({ [STANDINGS]: new ApiError('Sessão expirada', 401) })
    await render(h(HomeScreen, { user: me, navigation: navigationMock(), onExpired: expired, notificationSummary: noSummary() }))
    expect(expired).toHaveBeenCalled()
  })

  it('enquanto lê, o selo mostra o carregamento; uma resposta fora do formato não derruba o Início', async () => {
    let release!: (value: unknown) => void
    const pending = new Promise(resolve => { release = resolve })
    serve({ [STANDINGS]: () => pending })
    const tree = await render(h(HomeScreen, { user: me, navigation: navigationMock(), onExpired: vi.fn(), notificationSummary: noSummary() }))
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Carregando classificação').length).toBeGreaterThan(0)
    release({ items: [], next_cursor: null })
    await render(h('View', null))
    const odd = await mount({ items: [], next_cursor: null })
    expect(card(odd.tree, 'futebol')).toContain('0 de 3 partidas')
  })
})

describe('Início: "Encontrar partida"', () => {
  it('o atalho leva ao Jogar', async () => {
    const { tree, navigation } = await mount(standings())
    await pressButton(tree, 'Encontrar partida')
    expect(navigation.go).toHaveBeenCalledWith('play')
  })
})

describe('Início: "Próxima partida"', () => {
  const duel = sides(teamSide('a', ferrugemRef), teamSide('b', leoesRef))
  const scheduled = (id: number, hours: number, extra: Partial<MatchCard> = {}) => matchCard({ id, sides: duel, state: 'agendada', phase: 'agendada', starts_at: fromNow(hours), ...extra })

  it('sem partida agendada, o cartão diz que o próximo encontro aparecerá aqui', async () => {
    const { tree } = await mount(standings(), { matches: [matchCard({ id: 9, state: 'combinando' })] })
    expect(allText(tree)).toContain('PRÓXIMA PARTIDA')
    expect(byId(tree, 'next-match-empty')).toHaveLength(1)
    expect(allText(tree)).toContain('Seu próximo encontro aparecerá aqui.')
    expect(byId(tree, 'match-row')).toHaveLength(0)
  })

  it('mostra a agendada mais próxima que ainda não começou e leva à partida', async () => {
    const { tree, navigation } = await mount(standings(), { matches: [scheduled(1, 96), scheduled(2, 30), scheduled(3, -2), scheduled(4, 50, { state: 'cancelada' })] })
    expect(byId(tree, 'match-row')).toHaveLength(1)
    expect(byId(tree, 'next-match-empty')).toHaveLength(0)
    await act(async () => { byId(tree, 'match-row')[0].props.onPress() })
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 2 })
  })
})

describe('Início: o que já existia continua', () => {
  it('saudação, sino com contador e atalhos de times, campeonatos e provas', async () => {
    const { tree, navigation } = await mount(standings(), { unread: 12 })
    const text = allText(tree)
    expect(text).toContain('Bora jogar, Carlos?')
    expect(text).toContain('Veja o seu elo em cada modalidade e escolha por onde começar.')
    expect(text).not.toContain('em breve')
    expect(text).toContain('9+')
    await pressButton(tree, 'Notificações, 12 novas')
    expect(navigation.go).toHaveBeenLastCalledWith('notifications')
    await pressButton(tree, 'Meus times')
    expect(navigation.go).toHaveBeenLastCalledWith('teams')
    await pressButton(tree, 'Campeonatos')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'futebol' })
    await pressButton(tree, 'Provas de corrida')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'corrida' })
    expect(findButton(tree, 'Sugestões de quadra')).toBeUndefined()
  })

  it('a administração mantém as filas, inclusive quadras e W.O.', async () => {
    const { tree, navigation } = await mount(standings(), { user: admin })
    await pressButton(tree, 'Sugestões de quadra')
    expect(navigation.go).toHaveBeenLastCalledWith('admin-court-suggestions')
    await pressButton(tree, 'W.O. contestados')
    expect(navigation.go).toHaveBeenLastCalledWith('admin-walkover-disputes')
    expect(callsTo('GET', STANDINGS)).toHaveLength(1)
  })
})

describe('modalityStanding', () => {
  it('escolhe o maior elo entre times e posições; empate fica com o primeiro; contexto e métrica vêm da linha escolhida', () => {
    const data = standings([{ team: ferrugemRef, role: 'representante' }])
    // O `formats` das fixtures é compartilhado entre chamadas: troca-se a lista, não o item.
    const team = data.futebol.teams[0]
    data.futebol.teams = [{ ...team, formats: team.formats.map((format, index) => (index === 0 ? { ...format, ...ranked('prata', 12), state: 'ranqueado' as const } : format)) }]
    data.futebol.individual[0] = { ...data.futebol.individual[0], ...ranked('ouro', 4.25) }
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: 'ouro', context: 'Futsal · como goleiro', metric: { value: 4.25, unit: 'média' }, distanceKm: null })
    data.futebol.individual[0] = { ...data.futebol.individual[0], ...ranked('prata', 3) }
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: 'prata', context: 'Futsal · Ferrugem FC', metric: { value: 12, unit: 'pontos' } })
  })

  it('em classificação conta o maior número de partidas, limitado ao exigido; sem dados, tudo zerado', () => {
    const data = standings()
    data.futebol.individual[1] = { ...data.futebol.individual[1], ...placement(2) }
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: null, played: 2, required: 3, context: null, metric: null })
    expect(modalityStanding('tenis', { ...data, tenis: placement(7) })).toMatchObject({ tier: null, played: 3, required: 3 })
    expect(modalityStanding('futebol', null)).toMatchObject({ tier: null, played: 0, required: 3 })
    expect(modalityStanding('corrida', undefined)).toMatchObject({ tier: null, played: 0, required: 1, distanceKm: null })
  })

  it('corrida: elo na primeira marca, com a distância de maior elo; sem marca, nada', () => {
    const data = standings()
    data.corrida = [run(3, { state: 'ranqueado', tier: 'prata', played: 1, metric_value: 700 }), run(5, { state: 'ranqueado', tier: 'ouro', played: 2, metric_value: 1500 }), run(10, {}), run(21, {}), run(42, {})]
    expect(modalityStanding('corrida', data)).toMatchObject({ tier: 'ouro', required: 1, distanceKm: 5, metric: { value: 1500, unit: 'tempo' }, context: 'Nos 5 km' })
    data.corrida = data.corrida.map(line => run(line.distance_km, {}))
    expect(modalityStanding('corrida', data)).toMatchObject({ tier: null, played: 0, required: 1, distanceKm: null })
  })
})
