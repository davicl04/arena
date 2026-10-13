import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { ApiError, request } from '../src/api/client'
import type { Profile } from '../src/api/client'
import type { RankingOverview, RankingRow } from '../src/api/results'
import { connection } from '../src/api/connection'
import RankingScreen from '../src/screens/RankingScreen'
import { enableAct } from './support/native'
import { allText, byId, callsTo, flush, labelled, me, navigationMock, page as listPage, pressButton, render, serve } from './support/review'
import { football as footballProfile, notificationSummaryState, playContext, tennis as tennisProfile } from './support/play'
import { summaryOf } from './support/notifications'
import { athleteRow, myLine, rankingOverview, rankingPage, rankingRow, tierCounts } from './support/results'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const PROFILES = '/me/sports-profiles'
const OVERVIEW = '/rankings/overview?sport=futebol&kind=time&format=society'
const TIER = (tier: string, limit = '6') => `/rankings?sport=futebol&kind=time&format=society&tier=${tier}&limit=${limit}`
const CATEGORY = 'Categoria: Futebol · Society 7×7 · Times. Alterar'
const running: Profile = { ...footballProfile, id: 3, sport: 'corrida', position: null }
const ALL = [footballProfile, tennisProfile, running]

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

type Mounted = Awaited<ReturnType<typeof mount>>
function mount(params?: { sport?: 'futebol' | 'tenis' | 'corrida'; distanceKm?: 3 | 5 | 10 | 21 | 42 }, extra: { onExpired?: () => void; navigation?: ReturnType<typeof navigationMock> } = {}) {
  const navigation = extra.navigation ?? navigationMock()
  const onExpired = extra.onExpired ?? vi.fn()
  return render(h(RankingScreen as unknown as React.ComponentType<Record<string, unknown>>, { user: me, navigation, onExpired, params, title: 'Ranking', ...playContext() })).then(tree => ({ tree, navigation, onExpired }))
}
const rows = (m: Mounted) => byId(m.tree, 'ranking-row').filter(row => typeof row.type === 'string')
const rowNames = (m: Mounted) => rows(m).map(row => String(row.props.accessibilityLabel))
const positionsOf = (m: Mounted) => rowNames(m).map(label => /Posição (\d+) no elo/.exec(label)![1])

/** Linhas do elo Diamante nas posições `from` a `to`, com o titular em `mineAt`. */
const squad = (from: number, to: number, mineAt: number, overrides: Partial<RankingRow> = {}) => Array.from({ length: to - from + 1 }, (_, i) => {
  const position = from + i
  return rankingRow(position, position === mineAt ? 'Ferrugem FC' : `Time ${position}`, { tier: 'diamante', rank_position: position + 12, is_mine: position === mineAt, ...overrides })
})
const counts = tierCounts({ bronze: 30, prata: 20, ouro: 15, diamante: 12, lendario: 3 })
/** Titular em 6º de 12 no Diamante (a janela do backend vai de 3 a 9; o cliente mostra 4 a 8). */
const diamond = (overrides: Partial<RankingOverview> = {}) => rankingOverview({
  classified_count: 80, legend_slots: 12, tier_counts: counts, mine: [myLine('diamante', 6, 12)], selected_team_id: 102, window: squad(3, 9, 6),
  legends_preview: [{ team: { id: 7, name: 'Leões', initials: 'LE', crest_url: null }, athlete: null }], ...overrides,
})

describe('Ranking: estrutura e categoria', () => {
  it('a barra leva só o título e o sino, sem voltar; o sino mostra as novas e abre as notificações', async () => {
    serve({ [OVERVIEW]: diamond(), [PROFILES]: [footballProfile] })
    const navigation = navigationMock()
    const tree = await render(h(RankingScreen as unknown as React.ComponentType<Record<string, unknown>>, {
      user: me, navigation, onExpired: vi.fn(), params: undefined, title: 'Ranking', ...playContext(), notificationSummary: notificationSummaryState(summaryOf({ unread_count: 11, follow_requests_count: 1 })),
    }))
    expect(labelled(tree, 'Notificações, 12 novas')).toHaveLength(1)
    expect(allText(tree)).toContain('9+')
    expect(labelled(tree, 'Voltar')).toHaveLength(0)
    await pressButton(tree, 'Notificações, 12 novas')
    expect(navigation.go).toHaveBeenCalledWith('notifications')
  })

  it('abre em Futebol · Society 7×7 · Times, sem os cinco cartões de elos nem subtítulo, e lê o overview', async () => {
    serve({ [OVERVIEW]: diamond(), [PROFILES]: [footballProfile] })
    const m = await mount()
    const text = allText(m.tree)
    expect(callsTo('GET', OVERVIEW)).toHaveLength(1)
    expect(text).toContain('Futebol · Society 7×7 · Times')
    expect(text).not.toContain('CADA JOGO CONTA')
    expect(text).not.toContain('Reconstrua sua arena')
    expect(['bronze', 'prata', 'ouro', 'diamante', 'lendario'].some(key => byId(m.tree, `tier-${key}`).length > 0)).toBe(false)
    expect(labelled(m.tree, CATEGORY)).toHaveLength(1)
  })

  it('a folha só mostra as modalidades com perfil ativo; com uma só, o bloco some', async () => {
    serve({ [OVERVIEW]: diamond(), [PROFILES]: [footballProfile] })
    const m = await mount()
    await pressButton(m.tree, CATEGORY)
    expect(allText(m.tree)).toContain('Categoria do ranking')
    expect(allText(m.tree)).toContain('Futebol é a sua única modalidade ativa')
    expect(labelled(m.tree, 'Modalidade')).toHaveLength(0)
    expect(byId(m.tree, 'sport-tile-tenis')).toHaveLength(0)
    await pressButton(m.tree, 'Ver ranking')
    expect(allText(m.tree)).not.toContain('Categoria do ranking')
  })

  it('com duas ou três modalidades, a folha mostra só as do titular, na ordem futebol, tênis e corrida', async () => {
    serve({ [OVERVIEW]: diamond(), [PROFILES]: [running, footballProfile] })
    const m = await mount()
    await pressButton(m.tree, CATEGORY)
    const tiles = m.tree.root.findAll(node => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('sport-tile-')).map(node => node.props.testID)
    expect(tiles).toEqual(['sport-tile-futebol', 'sport-tile-corrida'])
    expect(labelled(m.tree, 'Modalidade').length).toBeGreaterThan(0)
  })

  it('a escolha da folha vale na hora: formato, tipo, posição, modalidade e distância leem o overview da categoria', async () => {
    serve({
      [PROFILES]: ALL.map((profile, i) => (i === 0 ? { ...profile, position: 'goleiro' } : profile)),
      [OVERVIEW]: diamond(),
      '/rankings/overview?sport=futebol&kind=time&format=futsal': rankingOverview({ classified_count: 0 }),
      '/rankings/overview?sport=futebol&kind=individual&format=futsal&position=goleiro': rankingOverview({ ranking: 'futebol_individual', classified_count: 0 }),
      '/rankings/overview?sport=futebol&kind=individual&format=futsal&position=defesa': rankingOverview({ ranking: 'futebol_individual', classified_count: 0 }),
      '/rankings/overview?sport=tenis': rankingOverview({ ranking: 'tenis', classified_count: 0 }),
      '/rankings/overview?sport=corrida&distance_km=5': rankingOverview({ ranking: 'corrida_5', classified_count: 0, required: 1 }),
      '/rankings/overview?sport=corrida&distance_km=21': rankingOverview({ ranking: 'corrida_21', classified_count: 0, required: 1 }),
    })
    const m = await mount()
    await pressButton(m.tree, CATEGORY)
    await pressButton(m.tree, 'Futsal, 5×5')
    expect(callsTo('GET', '/rankings/overview?sport=futebol&kind=time&format=futsal')).toHaveLength(1)
    await pressButton(m.tree, 'Individual')
    // A posição inicial é a do perfil de futebol do titular.
    expect(callsTo('GET', '/rankings/overview?sport=futebol&kind=individual&format=futsal&position=goleiro')).toHaveLength(1)
    expect(allText(m.tree)).toContain('Futebol · Futsal 5×5 · Goleiro')
    await pressButton(m.tree, 'Defesa')
    expect(callsTo('GET', '/rankings/overview?sport=futebol&kind=individual&format=futsal&position=defesa')).toHaveLength(1)
    expect(allText(m.tree)).toContain('O ranking de Futsal · Defesa começa quando as primeiras partidas forem confirmadas. São 3 partidas para sair da classificação.')
    await pressButton(m.tree, 'Tênis')
    expect(callsTo('GET', '/rankings/overview?sport=tenis')).toHaveLength(1)
    expect(labelled(m.tree, 'Formato')).toHaveLength(0)
    await pressButton(m.tree, 'Corrida')
    expect(allText(m.tree)).toContain('Corrida · 5 km')
    await pressButton(m.tree, '21 km')
    expect(callsTo('GET', '/rankings/overview?sport=corrida&distance_km=21')).toHaveLength(1)
  })

  it('abre já na modalidade e na distância pedidas pela rota; sem esse perfil, na primeira modalidade ativa', async () => {
    serve({
      [PROFILES]: ALL,
      '/rankings/overview?sport=corrida&distance_km=10': rankingOverview({ ranking: 'corrida_10', classified_count: 0, required: 1 }),
    })
    const m = await mount({ sport: 'corrida', distanceKm: 10 })
    expect(callsTo('GET', '/rankings/overview?sport=corrida&distance_km=10')).toHaveLength(1)
    expect(callsTo('GET', OVERVIEW)).toHaveLength(0)
    expect(allText(m.tree)).toContain('Corrida · 10 km')
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond() })
    const other = await mount({ sport: 'tenis' })
    expect(callsTo('GET', OVERVIEW)).toHaveLength(1)
    expect(allText(other.tree)).toContain('Futebol · Society 7×7 · Times')
  })

  it('sem nenhum perfil esportivo: estado vazio com "Configurar modalidade", sem cartão, Salão nem placa', async () => {
    serve({ [PROFILES]: [] })
    const m = await mount()
    expect(allText(m.tree)).toContain('Você ainda não joga nenhuma modalidade')
    expect(byId(m.tree, 'category-card')).toHaveLength(0)
    expect(callsTo('GET', OVERVIEW)).toHaveLength(0)
    await pressButton(m.tree, 'Configurar modalidade')
    expect(m.navigation.go).toHaveBeenCalledWith('profile')
  })

  it('a lista de perfis fora do formato esperado não derruba a tela (estado sem modalidade)', async () => {
    serve({ [PROFILES]: listPage([]) })
    const m = await mount()
    expect(allText(m.tree)).toContain('Você ainda não joga nenhuma modalidade')
  })
})

describe('Ranking: placa do elo, posição e diferenças', () => {
  it('mostra a posição no elo, as diferenças e a janela ±2, sem a posição geral nem Top %', async () => {
    serve({ [OVERVIEW]: diamond(), [PROFILES]: [footballProfile] })
    const m = await mount()
    const text = allText(m.tree)
    expect(text).toContain('SUA POSIÇÃO NO DIAMANTE')
    expect(text).toContain('6º')
    expect(text).toContain('de 12 no Diamante · Ferrugem FC')
    expect(text).toContain('38 | pontos')
    expect(text).toContain('7 pts | atrás do 1º')
    expect(text).toContain('1 pt | à frente do 7º')
    // A posição geral (rank_position 18) e porcentagens nunca aparecem.
    expect(text).not.toContain('18º')
    expect(text).not.toContain('Top')
    // A janela mostra 4 a 8 (o titular com 2 acima e 2 abaixo); a 3ª e a 9ª viram a borda esmaecida.
    expect(positionsOf(m)).toEqual(['4', '5', '6', '7', '8'])
    expect(rows(m)[2].props.accessibilityState.selected).toBe(true)
    expect(rows(m)[2].props.style.borderColor).toBe('rgba(143,224,180,0.4)')
    expect(byId(m.tree, 'fade-edge-up')).toHaveLength(1)
    expect(labelled(m.tree, 'Ver 3 times acima')).toHaveLength(1)
    expect(labelled(m.tree, 'Ver 4 times abaixo')).toHaveLength(1)
    expect(rowNames(m)[2]).toMatch(/^Seu time\. Posição 6 no elo, Ferrugem FC/)
  })

  it('"Lidera" no 1º e "Último" no fim do elo, com "o Diamante" e "do Diamante"', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [myLine('diamante', 1, 12, { leader_gap: null })], window: squad(1, 4, 1) }) })
    const first = await mount()
    expect(allText(first.tree)).toContain('Lidera | o Diamante')
    expect(allText(first.tree)).toContain('à frente do 2º')
    expect(labelled(first.tree, 'Ver 3 times acima')).toHaveLength(0)
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [myLine('diamante', 12, 12, { next_gap: null, next_tier_position: null })], window: squad(9, 12, 12) }) })
    const last = await mount()
    expect(allText(last.tree)).toContain('Último | do Diamante')
    expect(allText(last.tree)).toContain('atrás do 1º')
    expect(labelled(last.tree, 'Ver 9 times acima')).toHaveLength(1)
  })

  it('individual: diferenças em média com duas casas; corrida: em tempo, com "melhor marca em dd/mm" no lugar da forma', async () => {
    const INDIVIDUAL = '/rankings/overview?sport=futebol&kind=individual&format=society&position=atacante'
    const RUN = '/rankings/overview?sport=corrida&distance_km=5'
    const runners = [1, 2, 3].map(position => athleteRow(position, 40 + position, `Corredor ${position}`, {
      tier: 'ouro', metric_value: 1300 + position * 10, form: null, best_mark_on: `2026-09-0${position}`, is_mine: position === 2,
    }))
    serve({
      [PROFILES]: [footballProfile, running],
      [OVERVIEW]: diamond(),
      [INDIVIDUAL]: rankingOverview({ ranking: 'futebol_individual', position: 'atacante', classified_count: 10, tier_counts: tierCounts({ ouro: 10 }),
        mine: [myLine('ouro', 4, 10, { team: null, metric_value: 4.25, leader_gap: 0.28, next_gap: 1, next_tier_position: 5 })], window: [athleteRow(4, 9, 'Bia Goleira', { tier: 'ouro', is_mine: true, metric_value: 4.25 })] }),
      [RUN]: rankingOverview({ ranking: 'corrida_5', distance_km: 5, required: 1, classified_count: 3, tier_counts: tierCounts({ ouro: 3 }),
        mine: [myLine('ouro', 2, 3, { team: null, state: 'ranqueado', played: 3, required: 1, metric_value: 1320, leader_gap: 42, next_gap: 3905, next_tier_position: 3 })], window: runners }),
    })
    const m = await mount()
    await pressButton(m.tree, CATEGORY)
    await pressButton(m.tree, 'Individual')
    expect(allText(m.tree)).toContain('0,28 | atrás do 1º')
    expect(allText(m.tree)).toContain('de 10 no Ouro')
    expect(allText(m.tree)).not.toContain('Ferrugem')
    await pressButton(m.tree, 'Corrida')
    const text = allText(m.tree)
    expect(text).toContain('22:00 | tempo')
    expect(text).toContain('0:42 | atrás do 1º')
    expect(text).toContain('1:05:05 | à frente do 3º')
    expect(text).toContain('melhor marca em 02/09')
    expect(rowNames(m).join('\n')).toContain('melhor marca em 03/09')
    expect(byId(m.tree, 'recent-form')).toHaveLength(0)
  })

  it('forma recente: do mais antigo ao mais recente, com o nome acessível; o tênis só tem V e D', async () => {
    const TENIS = '/rankings/overview?sport=tenis'
    serve({
      [PROFILES]: [footballProfile, tennisProfile],
      [OVERVIEW]: diamond({ window: squad(3, 9, 6, { form: ['V', 'V', 'E', 'D', 'V'] }) }),
      [TENIS]: rankingOverview({ ranking: 'tenis', format: null, classified_count: 4, tier_counts: tierCounts({ prata: 4 }),
        mine: [myLine('prata', 2, 4, { team: null })], window: [athleteRow(1, 31, 'Ana Souza', { tier: 'prata', form: ['D', 'V'] }), athleteRow(2, 1, 'Carlos Lima', { tier: 'prata', is_mine: true, form: [] })] }),
    })
    const m = await mount()
    const forms = byId(m.tree, 'recent-form')
    expect(forms).toHaveLength(5)
    expect(forms[0].props.accessibilityLabel).toBe('Últimos resultados: vitória, vitória, empate, derrota, vitória')
    expect(forms[0].findAllByType('Text' as never).map(node => node.props.children)).toEqual(['V', 'V', 'E', 'D', 'V'])
    await pressButton(m.tree, CATEGORY)
    await pressButton(m.tree, 'Tênis')
    expect(labelled(m.tree, 'Últimos resultados: derrota, vitória')).toHaveLength(1)
    // Linha sem forma gravada (antes do recálculo): sem quadradinhos.
    expect(byId(m.tree, 'recent-form')).toHaveLength(1)
  })

  it('toque numa linha de atleta abre o perfil; a minha linha leva ao meu perfil e a de um time não navega', async () => {
    const TENIS = '/rankings/overview?sport=tenis'
    serve({
      [PROFILES]: [tennisProfile],
      [TENIS]: rankingOverview({ ranking: 'tenis', format: null, classified_count: 2, tier_counts: tierCounts({ ouro: 2 }),
        mine: [myLine('ouro', 2, 2, { team: null })], window: [athleteRow(1, 31, 'Ana Souza', { tier: 'ouro' }), athleteRow(2, 1, 'Carlos Lima', { tier: 'ouro', is_mine: true })] }),
    })
    const m = await mount()
    await pressButton(m.tree, 'Abrir perfil de Ana Souza. Posição 1 no elo, Ana Souza, Últimos resultados: vitória, empate, derrota, vitória, vitória, 39 pontos')
    expect(m.navigation.go).toHaveBeenLastCalledWith('user-profile', { userId: 31 })
    const mine = rows(m).find(row => String(row.props.accessibilityLabel).includes('Carlos Lima'))!
    await act(async () => { mine.props.onPress() })
    expect(m.navigation.go).toHaveBeenLastCalledWith('profile')
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond() })
    const teams = await mount()
    expect(rows(teams).every(row => row.props.onPress === undefined)).toBe(true)
  })
})

describe('Ranking: troca de elo e Salão', () => {
  it('as setas pulam os elos vazios e a placa lê o elo escolhido com tier= e limit=6', async () => {
    serve({
      [PROFILES]: [footballProfile],
      [OVERVIEW]: diamond({ tier_counts: tierCounts({ bronze: 30, prata: 20, ouro: 0, diamante: 12, lendario: 3 }) }),
      [TIER('prata')]: rankingPage({ items: Array.from({ length: 6 }, (_, i) => rankingRow(i + 1, `Prata ${i + 1}`, { tier: 'prata' })), next_cursor: 'c1' }),
    })
    const m = await mount()
    expect(labelled(m.tree, 'Ver elo Ouro')).toHaveLength(0)
    expect(labelled(m.tree, 'Ver elo Prata')).toHaveLength(1)
    await pressButton(m.tree, 'Ver elo Prata')
    expect(callsTo('GET', TIER('prata'))).toHaveLength(1)
    const text = allText(m.tree)
    expect(text).toContain('Você está no Diamante. Os 5 primeiros no Prata:')
    expect(text).toContain('PRATA')
    expect(text).toContain('20 times')
    expect(rowNames(m)).toHaveLength(5)
    expect(rowNames(m)[0]).toContain('Posição 1 no elo, Prata 1')
    expect(labelled(m.tree, 'Ver 15 times abaixo')).toHaveLength(1)
    // A sexta linha só diz que há mais: aparece na borda esmaecida (cópia decorativa), não na lista.
    expect(rowNames(m).join('\n')).not.toContain('Prata 6')
    expect(text).not.toContain('SUA POSIÇÃO NO DIAMANTE')
  })

  it('a seta para cima do Diamante abre o Salão com a categoria; sem elo acima, a seta fica desabilitada', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond() })
    const m = await mount()
    await pressButton(m.tree, 'Abrir o Salão dos Lendários')
    expect(m.navigation.go).toHaveBeenLastCalledWith('legends', { category: { sport: 'futebol', kind: 'time', format: 'society' } })
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ tier_counts: tierCounts({ bronze: 30, diamante: 12 }) }) })
    const none = await mount()
    expect(labelled(none.tree, 'Nenhum elo acima')[0].props.accessibilityState.disabled).toBe(true)
    expect(labelled(none.tree, 'Abrir o Salão dos Lendários')).toHaveLength(0)
    expect(allText(none.tree)).toContain('Nenhum Lendário ainda')
    expect(byId(none.tree, 'legends-entry')).toHaveLength(0)
  })

  it('a entrada do Salão mostra a contagem, "+N" e abre a subtela; titular Lendário vê "Você está no Salão" e a placa "no Salão"', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond() })
    const m = await mount()
    expect(allText(m.tree)).toContain('SALÃO DOS LENDÁRIOS')
    expect(allText(m.tree)).toContain('3 Lendários')
    expect(allText(m.tree)).toContain('+2')
    await pressButton(m.tree, 'Salão dos Lendários. 3 Lendários. Abrir')
    expect(m.navigation.go).toHaveBeenLastCalledWith('legends', { category: { sport: 'futebol', kind: 'time', format: 'society' } })
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [myLine('lendario', 2, 3)], window: squad(1, 3, 2, { tier: 'lendario' }) }) })
    const hall = await mount()
    const text = allText(hall.tree)
    expect(text).toContain('Você está no Salão')
    expect(text).toContain('SUA POSIÇÃO NO SALÃO')
    expect(text).toContain('de 3 no Salão · Ferrugem FC')
    expect(text).toContain('LENDÁRIO')
    expect(labelled(hall.tree, 'Abrir o Salão dos Lendários')).toHaveLength(0)
    expect(labelled(hall.tree, 'Ver elo Diamante')).toHaveLength(1)
  })

  it('sem Lendários (sem vagas): cartão discreto "Nenhum Lendário ainda" com a regra de 7 classificados', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ legend_slots: 0, tier_counts: tierCounts({ diamante: 12 }), legends_preview: [] }) })
    const m = await mount()
    expect(byId(m.tree, 'legends-none')).toHaveLength(1)
    expect(allText(m.tree)).toContain('As vagas abrem com 7 classificados (15%), entre quem tem os pontos de Diamante.')
  })
})

describe('Ranking: borda esmaecida e expansão do elo', () => {
  const FULL = TIER('diamante', '20')
  const fullPage = (from: number, to: number, cursor: string | null) => rankingPage({ items: squad(from, to, 6), next_cursor: cursor })

  it('a borda carrega o elo inteiro com tier= e cursor, mantém o titular e "Mostrar só ao seu redor" volta à janela', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond(), [FULL]: fullPage(1, 8, 'c1'), [`${FULL}&cursor=c1`]: fullPage(9, 12, null) })
    const m = await mount()
    expect(callsTo('GET', FULL)).toHaveLength(0)
    await pressButton(m.tree, 'Ver 3 times acima')
    expect(callsTo('GET', FULL)).toHaveLength(1)
    expect(rowNames(m)).toHaveLength(8)
    expect(rowNames(m)[0]).toContain('Posição 1 no elo, Time 1')
    expect(rows(m)[5].props.accessibilityState.selected).toBe(true)
    // No fim da página carregada, a mesma borda chama a próxima página.
    expect(labelled(m.tree, 'Ver mais 4 times')).toHaveLength(1)
    expect(byId(m.tree, 'fade-edge-up')).toHaveLength(0)
    await pressButton(m.tree, 'Ver mais 4 times')
    expect(callsTo('GET', `${FULL}&cursor=c1`)).toHaveLength(1)
    expect(rowNames(m)).toHaveLength(12)
    expect(byId(m.tree, 'fade-edge-down')).toHaveLength(0)
    await pressButton(m.tree, 'Mostrar só ao seu redor')
    expect(positionsOf(m)).toEqual(['4', '5', '6', '7', '8'])
    expect(labelled(m.tree, 'Mostrar só ao seu redor')).toHaveLength(0)
  })

  it('um erro ao expandir aparece abaixo da lista com "Tentar de novo" e a janela continua visível', async () => {
    let fail = true
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond(), [FULL]: () => (fail ? new ApiError('Não foi possível carregar o ranking.', 500) : fullPage(1, 8, null)) })
    const m = await mount()
    await pressButton(m.tree, 'Ver 4 times abaixo')
    expect(allText(m.tree)).toContain('Não foi possível carregar o ranking.')
    expect(rowNames(m)).toHaveLength(5)
    fail = false
    await pressButton(m.tree, 'Tentar de novo')
    expect(rowNames(m)).toHaveLength(8)
    expect(allText(m.tree)).not.toContain('Não foi possível carregar o ranking.')
  })

  it('falha ao carregar a próxima página mantém a lista e o "Tentar de novo" continua do mesmo cursor', async () => {
    let fail = true
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond(), [FULL]: fullPage(1, 8, 'c1'),
      [`${FULL}&cursor=c1`]: () => (fail ? new ApiError('Sem conexão com o servidor.', 0) : fullPage(9, 12, null)) })
    const m = await mount()
    await pressButton(m.tree, 'Ver 3 times acima')
    await pressButton(m.tree, 'Ver mais 4 times')
    expect(allText(m.tree)).toContain('Sem conexão com o servidor.')
    expect(rowNames(m)).toHaveLength(8)
    fail = false
    await pressButton(m.tree, 'Tentar de novo')
    expect(rowNames(m)).toHaveLength(12)
  })

  it('sessão expirada (401) ao expandir chama onExpired', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond(), [FULL]: new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    const m = await mount(undefined, { onExpired: expired })
    await pressButton(m.tree, 'Ver 3 times acima')
    expect(expired).toHaveBeenCalled()
  })

  it('em outro elo, a borda abre o elo inteiro e o botão volta aos 5 primeiros', async () => {
    const FULL_OURO = TIER('ouro', '20')
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond(),
      [TIER('ouro')]: rankingPage({ items: Array.from({ length: 6 }, (_, i) => rankingRow(i + 1, `Ouro ${i + 1}`)), next_cursor: 'c1' }),
      [FULL_OURO]: rankingPage({ items: Array.from({ length: 9 }, (_, i) => rankingRow(i + 1, `Ouro ${i + 1}`)), next_cursor: null }) })
    const m = await mount()
    await pressButton(m.tree, 'Ver elo Ouro')
    await pressButton(m.tree, 'Ver 10 times abaixo')
    expect(callsTo('GET', FULL_OURO)).toHaveLength(1)
    expect(rowNames(m)).toHaveLength(9)
    await pressButton(m.tree, 'Mostrar só os 5 primeiros')
    expect(rowNames(m)).toHaveLength(5)
  })

  it('uma lista pequena (sem linhas escondidas) não tem borda esmaecida', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [myLine('diamante', 2, 3)], window: squad(1, 3, 2), tier_counts: tierCounts({ diamante: 3 }) }) })
    const m = await mount()
    expect(byId(m.tree, 'fade-edge-up')).toHaveLength(0)
    expect(byId(m.tree, 'fade-edge-down')).toHaveLength(0)
    expect(rowNames(m)).toHaveLength(3)
  })
})

describe('Ranking: quem está sem elo e vários times', () => {
  const classification = myLine(null, null, null, { played: 2 })

  it('em classificação: medidor "2 de 3 partidas", faixas Bronze a Diamante e os 5 primeiros do Bronze por padrão', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [classification], window: null }),
      [TIER('bronze')]: rankingPage({ items: Array.from({ length: 6 }, (_, i) => rankingRow(i + 1, `Bronze ${i + 1}`, { tier: 'bronze' })) }),
      [TIER('prata')]: rankingPage({ items: [rankingRow(1, 'Prata 1', { tier: 'prata' })] }) })
    const m = await mount()
    const text = allText(m.tree)
    expect(text).toContain('SUA POSIÇÃO · FERRUGEM FC')
    expect(text).toContain('Em classificação')
    expect(text).toContain('2 de 3 partidas')
    expect(text).not.toContain('SUA POSIÇÃO NO')
    expect(text).toContain('Você ainda não tem elo. Veja quem está em cada faixa:')
    for (const name of ['Bronze', 'Prata', 'Ouro', 'Diamante']) expect(labelled(m.tree, name).some(node => node.props.accessibilityRole === 'radio')).toBe(true)
    expect(labelled(m.tree, 'Lendário').filter(node => node.props.accessibilityRole === 'radio')).toHaveLength(0)
    expect(callsTo('GET', TIER('bronze'))).toHaveLength(1)
    expect(text).toContain('Os 5 primeiros no Bronze:')
    expect(rowNames(m)).toHaveLength(5)
    await pressButton(m.tree, 'Prata')
    expect(callsTo('GET', TIER('prata'))).toHaveLength(1)
    expect(allText(m.tree)).toContain('Os 5 primeiros no Prata:')
  })

  it('faixa sem integrantes diz que ninguém está nela', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [classification], window: null, tier_counts: tierCounts({ prata: 4 }) }) })
    const m = await mount()
    expect(allText(m.tree)).toContain('Ninguém no Bronze ainda.')
    expect(callsTo('GET', TIER('bronze'))).toHaveLength(0)
  })

  it('sem time ativo no ranking de times: explica e leva a Meus times', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond({ mine: [], window: null, selected_team_id: null, tier_counts: tierCounts({ bronze: 2 }) }),
      [TIER('bronze')]: rankingPage({ items: [rankingRow(1, 'Bronze 1', { tier: 'bronze' })] }) })
    const m = await mount()
    expect(allText(m.tree)).toContain('Sem time ativo')
    await pressButton(m.tree, 'Meus times')
    expect(m.navigation.go).toHaveBeenCalledWith('teams')
  })

  it('corrida sem marca: "Sem marca nos 5 km" com "Registrar uma corrida"', async () => {
    serve({ [PROFILES]: [running],
      '/rankings/overview?sport=corrida&distance_km=5': rankingOverview({ ranking: 'corrida_5', required: 1, classified_count: 4, tier_counts: tierCounts({ bronze: 4 }),
        mine: [myLine(null, null, null, { team: null, state: 'sem_marca', played: 0, required: 1 })] }),
      '/rankings?sport=corrida&distance_km=5&tier=bronze&limit=6': rankingPage({ ranking: 'corrida_5', items: [athleteRow(1, 8, 'Rui Veloz', { tier: 'bronze', form: null, best_mark_on: '2026-09-03', metric_value: 1500 })] }) })
    const m = await mount()
    expect(allText(m.tree)).toContain('Sem marca nos 5 km')
    expect(allText(m.tree)).toContain('melhor marca em 03/09')
    await pressButton(m.tree, 'Registrar uma corrida')
    expect(m.navigation.go).toHaveBeenCalledWith('play')
  })

  it('vários times: chips com o escudo e o nome trocam a linha da placa e enviam team_id', async () => {
    const second = myLine('ouro', 3, 15, { team: { id: 205, name: 'Tigres do Lago', initials: 'TL', crest_url: null }, metric_value: 30 })
    serve({ [PROFILES]: [footballProfile],
      [OVERVIEW]: diamond({ mine: [myLine('diamante', 6, 12), second] }),
      [`${OVERVIEW}&team_id=205`]: diamond({ mine: [myLine('diamante', 6, 12), second], selected_team_id: 205, window: squad(1, 6, 3, { tier: 'ouro' }) }) })
    const m = await mount()
    expect(labelled(m.tree, 'Time')).toHaveLength(1)
    expect(labelled(m.tree, 'Time Ferrugem FC')[0].props.accessibilityState.checked).toBe(true)
    expect(allText(m.tree)).toContain('de 12 no Diamante · Ferrugem FC')
    await pressButton(m.tree, 'Time Tigres do Lago')
    expect(callsTo('GET', `${OVERVIEW}&team_id=205`)).toHaveLength(1)
    const text = allText(m.tree)
    expect(text).toContain('SUA POSIÇÃO NO OURO')
    expect(text).toContain('de 15 no Ouro · Tigres do Lago')
    expect(labelled(m.tree, 'Time Tigres do Lago')[0].props.accessibilityState.checked).toBe(true)
  })

  it('um só time não mostra os chips', async () => {
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: diamond() })
    const m = await mount()
    expect(labelled(m.tree, 'Time')).toHaveLength(0)
  })
})

describe('Ranking: estados vazios e erros', () => {
  it('vazio honesto: sem classificados, a placa de posição continua e não há linhas nem elos inventados', async () => {
    serve({ [PROFILES]: [footballProfile, running], [OVERVIEW]: rankingOverview({ classified_count: 0, mine: [myLine(null, null, null, { played: 1 })] }),
      '/rankings/overview?sport=corrida&distance_km=5': rankingOverview({ ranking: 'corrida_5', required: 1, classified_count: 0 }) })
    const m = await mount()
    expect(byId(m.tree, 'ranking-empty')).toHaveLength(1)
    expect(allText(m.tree)).toContain('Ninguém classificado ainda')
    expect(allText(m.tree)).toContain('São 3 partidas para sair da classificação.')
    expect(allText(m.tree)).toContain('1 de 3 partidas')
    expect(rows(m)).toHaveLength(0)
    expect(byId(m.tree, 'tier-plate')).toHaveLength(0)
    expect(byId(m.tree, 'legends-entry')).toHaveLength(0)
    await pressButton(m.tree, CATEGORY)
    await pressButton(m.tree, 'Corrida')
    expect(allText(m.tree)).toContain('Ninguém com marca nos 5 km ainda')
    expect(allText(m.tree)).toContain('A primeira marca já classifica.')
    await pressButton(m.tree, 'Registrar uma corrida')
    expect(m.navigation.go).toHaveBeenCalledWith('play')
  })

  it('erro mostra a mensagem e "Tentar novamente" lê de novo; 401 expira a sessão', async () => {
    let fail = true
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: () => (fail ? new ApiError('Não foi possível carregar o ranking.', 500) : diamond()) })
    const m = await mount()
    expect(allText(m.tree)).toContain('Não foi possível carregar o ranking.')
    fail = false
    await pressButton(m.tree, 'Tentar novamente')
    expect(allText(m.tree)).toContain('SUA POSIÇÃO NO DIAMANTE')
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    await mount(undefined, { onExpired: expired })
    expect(expired).toHaveBeenCalled()
    serve({ [PROFILES]: new ApiError('Sessão expirada', 401) })
    const early = vi.fn()
    await mount(undefined, { onExpired: early })
    expect(early).toHaveBeenCalled()
  })

  it('falha ao ler os perfis é erro de tela com nova tentativa', async () => {
    let fail = true
    serve({ [PROFILES]: () => (fail ? new ApiError('Não foi possível carregar os dados.', 500) : [footballProfile]), [OVERVIEW]: diamond() })
    const m = await mount()
    expect(byId(m.tree, 'load-error-screen')).toHaveLength(1)
    fail = false
    await pressButton(m.tree, 'Tentar novamente')
    expect(allText(m.tree)).toContain('SUA POSIÇÃO NO DIAMANTE')
  })

  it('o erro é de tela (LoadError); se foi de conexão, diz isso e a leitura é refeita uma vez quando ela volta', async () => {
    let fail = true
    serve({ [PROFILES]: [footballProfile], [OVERVIEW]: () => (fail ? new ApiError('Sem resposta.', 503) : diamond()) })
    const m = await mount()
    expect(byId(m.tree, 'load-error-screen')).toHaveLength(1)
    expect(allText(m.tree)).toContain('Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.')
    expect(allText(m.tree)).not.toContain('Sem resposta.')
    fail = false
    await act(async () => { connection.lost({ mutating: false }); connection.reached() })
    await flush()
    expect(allText(m.tree)).toContain('SUA POSIÇÃO NO DIAMANTE')
    expect(byId(m.tree, 'load-error-screen')).toHaveLength(0)
    expect(callsTo('GET', OVERVIEW)).toHaveLength(2)
  })

  it('carregando mostra o status; a resposta de uma categoria antiga não substitui a atual', async () => {
    let releaseSlow!: (value: RankingOverview) => void
    const slow = new Promise<RankingOverview>(resolve => { releaseSlow = resolve })
    serve({ [PROFILES]: [footballProfile, tennisProfile], [OVERVIEW]: () => slow,
      '/rankings/overview?sport=tenis': rankingOverview({ ranking: 'tenis', format: null, classified_count: 1, tier_counts: tierCounts({ prata: 1 }), mine: [myLine('prata', 1, 1, { team: null })], window: [athleteRow(1, 1, 'Carlos Lima', { tier: 'prata', is_mine: true })] }) })
    const m = await mount()
    expect(allText(m.tree)).toContain('Carregando ranking…')
    expect(m.tree.root.findAll(node => node.props.testID === 'ranking-panel')[0].props.accessibilityState.busy).toBe(true)
    await pressButton(m.tree, CATEGORY)
    await pressButton(m.tree, 'Tênis')
    expect(allText(m.tree)).toContain('Carlos Lima')
    releaseSlow(diamond())
    await flush()
    expect(allText(m.tree)).toContain('Carlos Lima')
    expect(allText(m.tree)).not.toContain('SUA POSIÇÃO NO DIAMANTE')
  })
})
