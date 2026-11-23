import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { MatchCard } from '../src/api/matches'
import type { Profile } from '../src/api/client'
import type { MeStandings, RunStanding, StandingLine } from '../src/api/play'
import { modalityStanding } from '../src/components/arena/modalityStanding'
import type { ModalityStanding } from '../src/components/arena/modalityStanding'
import { pillAccessibilityLabel, pillMetric, pillStatus, pillTexts } from '../src/data/home'
import HomeScreen from '../src/screens/HomeScreen'
import { enableAct } from './support/native'
import { admin, allText, byId, callsTo, findButton, me, navigationMock, pressButton, render, serve } from './support/review'
import { emptySummary, ferrugemRef, football, notificationSummaryState, standings } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({
  sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' },
  sportIconsAlpha: { futebol: 'futebol-alfa.png', tenis: 'tenis-alfa.png', corrida: 'corrida-alfa.png' },
}))

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
const PROFILES = '/me/sports-profiles'

/** Monta o Início. Sem `profiles`, a lista de perfis não é simulada (falha): as pílulas seguem só a classificação. */
function mount(data: unknown, options: { unread?: number; user?: typeof me; matches?: MatchCard[]; profiles?: Profile[] } = {}) {
  const navigation = navigationMock()
  const onExpired = vi.fn()
  serve({ [STANDINGS]: data, ...(options.profiles ? { [PROFILES]: options.profiles } : {}) })
  const notificationSummary = notificationSummaryState(emptySummary({ unread_count: options.unread ?? 0 }))
  return render(h(HomeScreen, { user: options.user ?? me, navigation, onExpired, matches: options.matches, notificationSummary })).then(tree => ({ tree, navigation, onExpired }))
}
type Tree = Awaited<ReturnType<typeof mount>>['tree']
const pillNode = (tree: Tree, sport: string) => byId(tree, `pilula-${sport}`)[0]
const pill = (tree: Tree, sport: string) => allText({ root: pillNode(tree, sport) } as never)
const pillLabel = (tree: Tree, sport: string) => String(pillNode(tree, sport).props.accessibilityLabel)
const tennisProfile: Profile = { ...football, id: 2, sport: 'tenis', position: null }

describe('Início: Pílulas de "Seu elo"', () => {
  it('cabeçalho "Seu elo" e três pílulas na ordem futebol, tênis e corrida, com o nome; sem o carrossel de cartões', async () => {
    const { tree } = await mount(standings())
    const text = allText(tree)
    expect(text).toContain('Seu elo')
    expect(text).not.toContain('SEU ELO')
    expect(byId(tree, 'pilulas-plate')).toHaveLength(1)
    const order = ['futebol', 'tenis', 'corrida'].map(sport => text.indexOf(pill(tree, sport)))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(pill(tree, 'futebol')).toContain('Futebol')
    expect(pill(tree, 'tenis')).toContain('Tênis')
    expect(pill(tree, 'corrida')).toContain('Corrida')
    expect(byId(tree, 'modality-futebol')).toHaveLength(0)
    expect(findButton(tree, 'Ver ranking de Futebol')).toBeUndefined()
    expect(text).not.toContain('melhor tempo')
  })

  it('sem jogos: "0 de 3" e "Sem classificação", a corrida "Sem marca"; nenhum elo', async () => {
    const { tree } = await mount(standings())
    expect(pill(tree, 'futebol')).toContain('0 de 3')
    expect(pill(tree, 'futebol')).toContain('Sem classificação')
    expect(pill(tree, 'tenis')).toContain('0 de 3')
    expect(pill(tree, 'corrida')).toContain('Sem marca')
    expect(pill(tree, 'corrida')).toContain('Sem classificação')
    expect(pill(tree, 'corrida')).not.toContain('de 1')
    expect(pillLabel(tree, 'futebol')).toBe('Futebol: sem classificação, 0 de 3 partidas')
    expect(pillLabel(tree, 'corrida')).toBe('Corrida: sem marca, sem classificação')
    expect(allText(tree)).not.toMatch(/Bronze|Prata|Ouro|Diamante|Lendário/)
  })

  it('com elo: emblema, nome do elo e "{n} rating" inteiro; o tênis em classificação mostra "2 de 3"; sem posição no ranking', async () => {
    const { tree } = await mount(withLines({ society: ranked('ouro', 1087.494), tenis: placement(2) }))
    const football = pill(tree, 'futebol')
    expect(football).toContain('Ouro')
    expect(football).toContain('1087 rating')
    expect(football).not.toMatch(/pts|pontos/)
    expect(football).not.toContain('Sem classificação')
    expect(pillNode(tree, 'futebol').findAll(node => node.props.xml !== undefined).length).toBeGreaterThan(0)
    expect(pillLabel(tree, 'futebol')).toBe('Futebol: elo Ouro, 1087 rating')
    const tennis = pill(tree, 'tenis')
    expect(tennis).toContain('2 de 3')
    expect(tennis).toContain('Sem classificação')
    expect(tennis).not.toMatch(/Bronze|Prata|Ouro|Diamante|Lendário/)
    expect(pillLabel(tree, 'tenis')).toBe('Tênis: sem classificação, 2 de 3 partidas')
    expect(allText(tree)).not.toMatch(/4º|#4|posição/i)
  })

  it('tênis com elo: o rating inteiro com "rating", no texto e no nome acessível', async () => {
    const { tree } = await mount(withLines({ tenis: ranked('prata', 1012.5) }))
    expect(pill(tree, 'tenis')).toContain('Prata')
    expect(pill(tree, 'tenis')).toContain('1013 rating')
    expect(pill(tree, 'tenis')).not.toMatch(/pts|pontos/)
    expect(pillLabel(tree, 'tenis')).toBe('Tênis: elo Prata, 1013 rating')
  })

  it('individual com elo: a média por partida como "{n} média"', async () => {
    const data = standings()
    data.futebol.individual[0] = { ...data.futebol.individual[0], ...ranked('prata', 4.25) }
    const { tree } = await mount(data)
    expect(pill(tree, 'futebol')).toContain('Prata')
    expect(pill(tree, 'futebol')).toContain('4,25 média')
    expect(pillLabel(tree, 'futebol')).toBe('Futebol: elo Prata, 4,25 de média')
  })

  it('corrida: o tempo e a distância de maior elo; o toque abre o Ranking nessa distância, as outras na modalidade, e "Ver elos" no Ranking', async () => {
    const { tree, navigation } = await mount(withLines({ corrida: [
      run(5, { state: 'ranqueado', tier: 'ouro', played: 3, rank_position: 6, metric_value: 1452 }),
      run(21, { state: 'ranqueado', tier: 'diamante', played: 1, rank_position: 2, metric_value: 6330 }),
    ] }))
    const running = pill(tree, 'corrida')
    expect(running).toContain('Diamante')
    expect(running).toContain('1:45:30 · 21 km')
    expect(pillLabel(tree, 'corrida')).toBe('Corrida: elo Diamante, 1:45:30 nos 21 km')
    await pressButton(tree, pillLabel(tree, 'corrida'))
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'corrida', distanceKm: 21 })
    await pressButton(tree, pillLabel(tree, 'futebol'))
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'futebol' })
    await pressButton(tree, pillLabel(tree, 'tenis'))
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'tenis' })
    await pressButton(tree, 'Ver elos no Ranking')
    expect(navigation.go).toHaveBeenLastCalledWith('ranking')
  })

  it('corrida sem marca abre o Ranking da corrida sem distância', async () => {
    const { tree, navigation } = await mount(standings())
    await pressButton(tree, pillLabel(tree, 'corrida'))
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'corrida' })
  })

  it('nunca atribui elo a quem está em classificação, mesmo que a resposta traga a chave', async () => {
    const { tree } = await mount(withLines({ tenis: placement(2, { tier: 'ouro', metric_value: 30 }) }))
    expect(pill(tree, 'tenis')).toContain('2 de 3')
    expect(pill(tree, 'tenis')).not.toContain('Ouro')
    expect(pill(tree, 'tenis')).not.toContain('30')
  })

  it('sem perfil na modalidade: "Sem perfil" e "Configurar", mesmo com elo na resposta; o toque abre as modalidades', async () => {
    const { tree, navigation } = await mount(withLines({ society: ranked('ouro', 1038), tenis: ranked('prata', 1020) }), { profiles: [football] })
    expect(pill(tree, 'futebol')).toContain('1038 rating')
    for (const sport of ['tenis', 'corrida']) {
      expect(pill(tree, sport)).toContain('Sem perfil')
      expect(pill(tree, sport)).toContain('Configurar')
    }
    expect(pill(tree, 'tenis')).not.toContain('Prata')
    expect(pillLabel(tree, 'tenis')).toBe('Tênis: sem perfil, configurar')
    expect(pillNode(tree, 'tenis').props.accessibilityHint).toBe('Abre suas modalidades')
    await pressButton(tree, pillLabel(tree, 'tenis'))
    expect(navigation.go).toHaveBeenLastCalledWith('profile')
    await pressButton(tree, pillLabel(tree, 'corrida'))
    expect(navigation.go).toHaveBeenLastCalledWith('profile')
    await pressButton(tree, pillLabel(tree, 'futebol'))
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'futebol' })
  })

  it('conta nova: as três pílulas "Sem perfil"; com tênis e futebol, só a corrida', async () => {
    const empty = await mount(standings(), { profiles: [] })
    for (const sport of ['futebol', 'tenis', 'corrida']) expect(pill(empty.tree, sport)).toContain('Sem perfil')
    const two = await mount(standings(), { profiles: [football, tennisProfile] })
    expect(pill(two.tree, 'futebol')).toContain('0 de 3')
    expect(pill(two.tree, 'tenis')).toContain('0 de 3')
    expect(pill(two.tree, 'corrida')).toContain('Sem perfil')
  })

  it('falha ao ler a classificação: "Classificação indisponível" sem inventar números, ainda abrindo o Ranking; 401 expira a sessão', async () => {
    const failing = vi.fn()
    const navigation = navigationMock()
    serve({ [STANDINGS]: new ApiError('Não foi possível carregar os dados.', 500) })
    const tree = await render(h(HomeScreen, { user: me, navigation, onExpired: failing, notificationSummary: noSummary() }))
    for (const sport of ['futebol', 'tenis', 'corrida']) expect(pill(tree, sport)).toContain('Classificação indisponível')
    expect(pill(tree, 'futebol')).not.toMatch(/\d/)
    expect(pillLabel(tree, 'futebol')).toBe('Futebol: classificação indisponível')
    expect(failing).not.toHaveBeenCalled()
    await pressButton(tree, pillLabel(tree, 'futebol'))
    expect(navigation.go).toHaveBeenLastCalledWith('ranking', { sport: 'futebol' })
    const expired = vi.fn()
    serve({ [STANDINGS]: new ApiError('Sessão expirada', 401) })
    await render(h(HomeScreen, { user: me, navigation: navigationMock(), onExpired: expired, notificationSummary: noSummary() }))
    expect(expired).toHaveBeenCalled()
  })

  it('enquanto lê, as pílulas indicam o carregamento; uma resposta fora do formato não derruba o Início', async () => {
    let release!: (value: unknown) => void
    const pending = new Promise(resolve => { release = resolve })
    serve({ [STANDINGS]: () => pending })
    const tree = await render(h(HomeScreen, { user: me, navigation: navigationMock(), onExpired: vi.fn(), notificationSummary: noSummary() }))
    expect(pillLabel(tree, 'futebol')).toBe('Futebol: carregando classificação')
    expect(pill(tree, 'futebol')).toContain('…')
    expect(pill(tree, 'futebol')).not.toContain('Sem classificação')
    release({ items: [], next_cursor: null })
    await render(h('View', null))
    const odd = await mount({ items: [], next_cursor: null })
    expect(pill(odd.tree, 'futebol')).toContain('0 de 3')
  })

  it('a classificação e os perfis são lidos uma única vez', async () => {
    await mount(standings(), { profiles: [football] })
    expect(callsTo('GET', STANDINGS)).toHaveLength(1)
    expect(callsTo('GET', PROFILES)).toHaveLength(1)
  })
})

describe('Pílulas: regras puras', () => {
  const standing = (extra: Partial<ModalityStanding> = {}): ModalityStanding =>
    ({ tier: null, played: 1, required: 3, context: null, metric: null, distanceKm: null, ...extra })

  it('pillStatus: sem perfil confirmado vence; depois carregando, falha, elo, sem marca e classificação', () => {
    const ouro = standing({ tier: 'ouro', played: 3, metric: { value: 1087, ranking: 'futebol_time' } })
    expect(pillStatus('futebol', { standing: ouro, loading: false, hasProfile: false })).toEqual({ kind: 'no-profile' })
    expect(pillStatus('futebol', { standing: null, loading: true, hasProfile: false })).toEqual({ kind: 'no-profile' })
    expect(pillStatus('futebol', { standing: null, loading: true, hasProfile: null })).toEqual({ kind: 'loading' })
    expect(pillStatus('futebol', { standing: ouro, loading: true, hasProfile: true })).toEqual({ kind: 'loading' })
    expect(pillStatus('futebol', { standing: null, loading: false, hasProfile: true })).toEqual({ kind: 'unavailable' })
    expect(pillStatus('futebol', { standing: ouro, loading: false, hasProfile: null })).toEqual({ kind: 'tier', tier: 'ouro', metric: { value: 1087, ranking: 'futebol_time' }, distanceKm: null })
    expect(pillStatus('corrida', { standing: standing({ required: 1, played: 0 }), loading: false, hasProfile: true })).toEqual({ kind: 'no-mark' })
    expect(pillStatus('tenis', { standing: standing({ played: 2 }), loading: false, hasProfile: true })).toEqual({ kind: 'placement', played: 2, required: 3 })
  })

  it('pillMetric: rating inteiro, média, tempo com distância e os casos sem valor', () => {
    expect(pillMetric({ value: 1087.494, ranking: 'futebol_time' })).toBe('1087 rating')
    expect(pillMetric({ value: 1234.5, ranking: 'tenis' })).toBe('1235 rating')
    expect(pillMetric({ value: 7.5, ranking: 'futebol_individual' })).toBe('7,5 média')
    expect(pillMetric({ value: 4.256, ranking: 'futebol_individual' })).toBe('4,26 média')
    expect(pillMetric({ value: 6330, ranking: 'corrida_21' }, 21)).toBe('1:45:30 · 21 km')
    expect(pillMetric({ value: 1452, ranking: 'corrida_5' }, 5)).toBe('24:12 · 5 km')
    expect(pillMetric({ value: 1452, ranking: 'corrida_5' })).toBe('24:12')
    expect(pillMetric(null, 10)).toBe('10 km')
    expect(pillMetric(null)).toBeNull()
  })

  it('pillTexts e pillAccessibilityLabel: os textos de cada situação', () => {
    expect(pillTexts({ kind: 'placement', played: 1, required: 3 })).toEqual({ status: '1 de 3', detail: 'Sem classificação' })
    expect(pillTexts({ kind: 'no-mark' })).toEqual({ status: 'Sem marca', detail: 'Sem classificação' })
    expect(pillTexts({ kind: 'no-profile' })).toEqual({ status: 'Sem perfil', detail: 'Configurar' })
    expect(pillTexts({ kind: 'unavailable' })).toEqual({ status: 'Classificação indisponível', detail: null })
    expect(pillTexts({ kind: 'loading' })).toBeNull()
    expect(pillTexts({ kind: 'tier', tier: 'ouro', metric: null, distanceKm: null })).toBeNull()
    expect(pillAccessibilityLabel('Tênis', { kind: 'tier', tier: 'lendario', metric: null, distanceKm: null })).toBe('Tênis: elo Lendário')
    expect(pillAccessibilityLabel('Tênis', { kind: 'tier', tier: 'diamante', metric: { value: 1162.7, ranking: 'tenis' }, distanceKm: null })).toBe('Tênis: elo Diamante, 1163 rating')
    expect(pillAccessibilityLabel('Futebol', { kind: 'tier', tier: 'ouro', metric: { value: 4.25, ranking: 'futebol_individual' }, distanceKm: null })).toBe('Futebol: elo Ouro, 4,25 de média')
    expect(pillAccessibilityLabel('Corrida', { kind: 'tier', tier: 'bronze', metric: null, distanceKm: 5 })).toBe('Corrida: elo Bronze, nos 5 km')
    expect(pillAccessibilityLabel('Corrida', { kind: 'placement', played: 0, required: 1 })).toBe('Corrida: sem classificação, 0 de 1 partida')
    expect(pillAccessibilityLabel('Futebol', { kind: 'loading' })).toBe('Futebol: carregando classificação')
  })
})

describe('Início: o que já existia continua', () => {
  it('sino com contador; os atalhos de times, campeonatos e provas saíram (ficam no Jogar)', async () => {
    const { tree, navigation } = await mount(standings(), { unread: 12 })
    const text = allText(tree)
    expect(text).not.toContain('em breve')
    expect(text).toContain('9+')
    await pressButton(tree, 'Notificações, 12 novas')
    expect(navigation.go).toHaveBeenLastCalledWith('notifications')
    for (const label of ['Meus times', 'Campeonatos', 'Provas de corrida', 'Seja organizador', 'Meus eventos', 'Sugestões de quadra']) expect(findButton(tree, label)).toBeUndefined()
    expect(text).not.toMatch(/JOGAR|ORGANIZADOR|ADMINISTRAÇÃO/)
  })

  it('a administração não tem mais atalhos no Início (as filas ficam no menu do Perfil); a classificação é lida uma vez', async () => {
    const { tree } = await mount(standings(), { user: admin })
    for (const label of ['Pedidos de organizador', 'Eventos pagos', 'Organizador revogado', 'Devoluções contestadas', 'Sugestões de quadra', 'W.O. contestados', 'Denúncias']) expect(findButton(tree, label)).toBeUndefined()
    expect(allText(tree)).not.toContain('ADMINISTRAÇÃO')
    expect(callsTo('GET', STANDINGS)).toHaveLength(1)
  })
})

describe('modalityStanding', () => {
  it('escolhe o maior elo entre times e posições; empate fica com o primeiro; contexto e métrica vêm da linha escolhida', () => {
    const data = standings([{ team: ferrugemRef, role: 'representante' }])
    // O `formats` das fixtures é compartilhado entre chamadas: troca-se a lista, não o item.
    const team = data.futebol.teams[0]
    data.futebol.teams = [{ ...team, formats: team.formats.map((format, index) => (index === 0 ? { ...format, ...ranked('prata', 1012), state: 'ranqueado' as const } : format)) }]
    data.futebol.individual[0] = { ...data.futebol.individual[0], ...ranked('ouro', 4.25) }
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: 'ouro', context: 'Futsal · como goleiro', metric: { value: 4.25, ranking: 'futebol_individual' }, distanceKm: null })
    data.futebol.individual[0] = { ...data.futebol.individual[0], ...ranked('prata', 3) }
    expect(modalityStanding('futebol', data)).toMatchObject({ tier: 'prata', context: 'Futsal · Ferrugem FC', metric: { value: 1012, ranking: 'futebol_time' } })
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
    expect(modalityStanding('corrida', data)).toMatchObject({ tier: 'ouro', required: 1, distanceKm: 5, metric: { value: 1500, ranking: 'corrida_5' }, context: 'Nos 5 km' })
    data.corrida = data.corrida.map(line => run(line.distance_km, {}))
    expect(modalityStanding('corrida', data)).toMatchObject({ tier: null, played: 0, required: 1, distanceKm: null })
  })
})
