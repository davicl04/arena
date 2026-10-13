import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { RankingPage } from '../src/api/results'
import RankingScreen from '../src/screens/RankingScreen'
import { act } from 'react-test-renderer'
import { connection } from '../src/api/connection'
import { enableAct } from './support/native'
import { allText, byId, callsTo, findButton, flush, labelled, me, navigationMock, page as listPage, pressButton, render, serve } from './support/review'
import { football as footballProfile, notificationSummaryState, playContext } from './support/play'
import { summaryOf } from './support/notifications'
import { athleteRow, rankingPage, rankingRow } from './support/results'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const TEAMS = '/rankings?sport=futebol&kind=time&format=society&limit=20'
const PROFILES = '/me/sports-profiles'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

function mount(params?: { sport?: 'futebol' | 'tenis' | 'corrida'; distanceKm?: 3 | 5 | 10 | 21 | 42 }, extra: { onExpired?: () => void; navigation?: ReturnType<typeof navigationMock> } = {}) {
  const navigation = extra.navigation ?? navigationMock()
  const onExpired = extra.onExpired ?? vi.fn()
  return render(h(RankingScreen as unknown as React.ComponentType<Record<string, unknown>>, { user: me, navigation, onExpired, params, title: 'Ranking', ...playContext() })).then(tree => ({ tree, navigation, onExpired }))
}
const rows = (tree: Awaited<ReturnType<typeof mount>>['tree']) => byId(tree, 'ranking-row')
const teamsPage = (overrides: Partial<RankingPage> = {}) => rankingPage({
  items: [rankingRow(1, 'Leões do Cerrado', { tier: 'diamante', metric_value: 62, wins: 20, draws: 2, losses: 1, matches_played: 23 }), rankingRow(2, 'Ferrugem FC', { tier: 'ouro', metric_value: 38 })],
  classified_count: 2, ...overrides,
})

describe('Ranking: estrutura e modalidades', () => {
  it('o sino das Notificações fica no cabeçalho, com o número de novas, e abre a tela', async () => {
    serve({ [TEAMS]: teamsPage(), [PROFILES]: [] })
    const navigation = navigationMock()
    const tree = await render(h(RankingScreen as unknown as React.ComponentType<Record<string, unknown>>, {
      user: me, navigation, onExpired: vi.fn(), params: undefined, title: 'Ranking', ...playContext(), notificationSummary: notificationSummaryState(summaryOf({ unread_count: 11, follow_requests_count: 1 })),
    }))
    expect(labelled(tree, 'Notificações, 12 novas')).toHaveLength(1)
    expect(allText(tree)).toContain('9+')
    await pressButton(tree, 'Notificações, 12 novas')
    expect(navigation.go).toHaveBeenCalledWith('notifications')
    const quiet = await mount()
    expect(labelled(quiet.tree, 'Notificações')).toHaveLength(1)
  })

  it('abre em Futebol, Times, Society, com os cinco elos de referência e a lista geral', async () => {
    serve({ [TEAMS]: teamsPage(), [PROFILES]: [] })
    const { tree } = await mount()
    const text = allText(tree)
    expect(text).toContain('CADA JOGO CONTA')
    expect(text).toContain('Ranking')
    for (const name of ['Bronze', 'Prata', 'Ouro', 'Diamante', 'Lendário']) expect(text).toContain(name)
    expect(['bronze', 'prata', 'ouro', 'diamante', 'lendario'].every(key => byId(tree, `tier-${key}`).length > 0)).toBe(true)
    expect(callsTo('GET', TEAMS)).toHaveLength(1)
    expect(rows(tree).filter(row => typeof row.type === 'string')).toHaveLength(2)
    expect(text).toContain('Society')
    expect(text).toContain('2 classificados')
    expect(text).toContain('23 partidas · 20V 2E 1D')
    expect(text).toContain('62')
    expect(text).toContain('pontos')
    const first = rows(tree).find(row => typeof row.type === 'string')!
    expect(first.props.accessibilityLabel).toBe('Posição 1, Leões do Cerrado, 23 partidas · 20V 2E 1D, elo Diamante, 62 pontos')
  })

  it('vagas de Lendário aparecem quando existem', async () => {
    serve({ [TEAMS]: teamsPage({ classified_count: 14, legend_slots: 2 }), [PROFILES]: [] })
    const { tree } = await mount()
    expect(allText(tree)).toContain('14 classificados · 2 vagas de Lendário')
  })

  it('troca o formato e o tipo: cada escolha lê a lista da categoria', async () => {
    serve({
      [TEAMS]: teamsPage(),
      '/rankings?sport=futebol&kind=time&format=futsal&limit=20': teamsPage({ format: 'futsal', items: [rankingRow(1, 'Quadra Norte FC')], classified_count: 1 }),
      '/rankings?sport=futebol&kind=individual&format=futsal&position=goleiro&limit=20': rankingPage({
        ranking: 'futebol_individual', position: 'goleiro', items: [athleteRow(1, 7, 'Beto Goleiro', { metric_value: 4.256 })], classified_count: 1,
      }),
      '/rankings?sport=futebol&kind=individual&format=futsal&position=defesa&limit=20': rankingPage({ ranking: 'futebol_individual', position: 'defesa', items: [], classified_count: 0 }),
      [PROFILES]: [{ ...footballProfile, position: 'goleiro' }],
    })
    const { tree } = await mount()
    await pressButton(tree, 'Futsal, 5×5')
    expect(allText(tree)).toContain('Quadra Norte FC')
    expect(allText(tree)).toContain('Futsal')
    await pressButton(tree, 'Individual')
    // A posição inicial é a do perfil de futebol do atleta.
    expect(callsTo('GET', '/rankings?sport=futebol&kind=individual&format=futsal&position=goleiro&limit=20')).toHaveLength(1)
    expect(allText(tree)).toContain('Futsal · Goleiro')
    expect(allText(tree)).toContain('Beto Goleiro')
    // Média por partida com duas casas.
    expect(allText(tree)).toContain('4,26')
    expect(allText(tree)).toContain('média')
    await pressButton(tree, 'Defesa')
    expect(allText(tree)).toContain('Ninguém classificado ainda')
    expect(allText(tree)).toContain('O ranking de Futsal · Defesa começa quando as primeiras partidas forem confirmadas. São 3 partidas para sair da classificação.')
  })

  it('tênis é uma lista única, com vitórias e derrotas', async () => {
    serve({
      [TEAMS]: teamsPage(), [PROFILES]: [],
      '/rankings?sport=tenis&limit=20': rankingPage({ ranking: 'tenis', format: null, items: [athleteRow(1, 31, 'Ana Souza', { tier: 'prata', metric_value: 40, wins: 4, losses: 1, matches_played: 5, draws: 0 })], classified_count: 1 }),
    })
    const { tree } = await mount()
    await pressButton(tree, 'Tênis')
    const text = allText(tree)
    expect(text).toContain('Ana Souza')
    expect(text).toContain('5 partidas · 4V 1D')
    expect(labelled(tree, 'Formato')).toHaveLength(0)
    expect(labelled(tree, 'Posição')).toHaveLength(0)
  })

  it('corrida por distância: o melhor tempo em segundos vira h:mm:ss e o menor tempo vence', async () => {
    serve({
      [TEAMS]: teamsPage(), [PROFILES]: [],
      '/rankings?sport=corrida&distance_km=5&limit=20': rankingPage({ ranking: 'corrida_5', format: null, distance_km: 5, items: [athleteRow(1, 5, 'Bia Rocha', { tier: 'ouro', metric_value: 1452, matches_played: 3, wins: 0, draws: 0, losses: 0, goals_for: null })], classified_count: 1 }),
      '/rankings?sport=corrida&distance_km=21&limit=20': rankingPage({ ranking: 'corrida_21', format: null, distance_km: 21, items: [athleteRow(1, 5, 'Bia Rocha', { tier: 'prata', metric_value: 6330, matches_played: 1 })], classified_count: 1 }),
    })
    const { tree } = await mount()
    await pressButton(tree, 'Corrida')
    const text = allText(tree)
    expect(text).toContain('24:12')
    expect(text).toContain('tempo')
    expect(text).toContain('menor tempo vence')
    expect(text).toContain('3 marcas')
    expect(text).not.toContain('pontos')
    await pressButton(tree, '21 km')
    expect(allText(tree)).toContain('1:45:30')
    expect(allText(tree)).toContain('1 marca')
  })

  it('abre já na modalidade e na distância pedidas pela rota (Ver ranking das marcas e do Início)', async () => {
    serve({ '/rankings?sport=corrida&distance_km=10&limit=20': rankingPage({ ranking: 'corrida_10', format: null, distance_km: 10, items: [], classified_count: 0 }), [PROFILES]: [] })
    const { tree } = await mount({ sport: 'corrida', distanceKm: 10 })
    expect(callsTo('GET', '/rankings?sport=corrida&distance_km=10&limit=20')).toHaveLength(1)
    expect(callsTo('GET', TEAMS)).toHaveLength(0)
    expect(allText(tree)).toContain('10 km')
    const choice = labelled(tree, '10 km').find(node => node.props.accessibilityRole === 'radio')
    expect(choice!.props.accessibilityState.checked).toBe(true)
  })
})

describe('Ranking: minha linha e classificação', () => {
  it('quem está em classificação aparece em "Sua posição" com "n de 3 partidas" e nunca com elo', async () => {
    serve({
      [TEAMS]: teamsPage({
        mine: [{ team: { id: 9, name: 'Tigres do Lago', initials: 'TL', crest_url: null }, state: 'classificacao', tier: null, played: 2, required: 3, rank_position: null, metric_value: 4, faces: [], faces_any_level: true }],
      }),
      [PROFILES]: [],
    })
    const { tree } = await mount()
    const plate = byId(tree, 'my-ranking').find(node => typeof node.type === 'string')!
    const plateText = allText({ root: plate } as never)
    expect(plateText).toContain('SUA POSIÇÃO')
    expect(plateText).toContain('Tigres do Lago')
    expect(plateText).toContain('Em classificação')
    expect(plateText).toContain('2 de 3 partidas')
    expect(plateText).not.toMatch(/Bronze|Prata|Ouro|Diamante|Lendário/)
    expect(labelled({ root: plate } as never, 'Elo Ouro')).toHaveLength(0)
  })

  it('ranqueado mostra o elo, a colocação e a métrica; a linha na lista fica em destaque como "Seu time"', async () => {
    serve({
      [TEAMS]: teamsPage({
        items: [rankingRow(1, 'Leões do Cerrado', { tier: 'diamante' }), rankingRow(2, 'Ferrugem FC', { tier: 'ouro', is_mine: true, metric_value: 38 })],
        mine: [{ team: { id: 102, name: 'Ferrugem FC', initials: 'FE', crest_url: null }, state: 'ranqueado', tier: 'ouro', played: 8, required: 3, rank_position: 2, metric_value: 38, faces: ['prata', 'ouro', 'diamante'], faces_any_level: false }],
      }),
      [PROFILES]: [],
    })
    const { tree } = await mount()
    const text = allText(tree)
    expect(text).toContain('2º lugar · 38 pontos')
    expect(text).toContain('Seu time')
    const mine = rows(tree).filter(row => typeof row.type === 'string')[1]
    expect(mine.props.accessibilityLabel).toMatch(/^Seu time\. Posição 2, Ferrugem FC/)
    expect(mine.props.style.borderLeftWidth).toBe(3)
  })

  it('sem time ativo no ranking de times: explica e leva a Meus times', async () => {
    serve({ [TEAMS]: teamsPage({ mine: [] }), [PROFILES]: [] })
    const { tree, navigation } = await mount()
    expect(allText(tree)).toContain('Você ainda não faz parte de um time ativo.')
    await pressButton(tree, 'Meus times')
    expect(navigation.go).toHaveBeenCalledWith('teams')
  })

  it('corrida sem marca: "Sem marca neste ranking", sem elo', async () => {
    serve({
      [TEAMS]: teamsPage(), [PROFILES]: [],
      '/rankings?sport=corrida&distance_km=5&limit=20': rankingPage({
        ranking: 'corrida_5', items: [], classified_count: 0, required: 1,
        mine: [{ team: null, state: 'sem_marca', tier: null, played: 0, required: 1, rank_position: null, metric_value: null, faces: [], faces_any_level: true }],
      }),
    })
    const { tree } = await mount()
    await pressButton(tree, 'Corrida')
    expect(allText(tree)).toContain('Sem marca neste ranking')
    expect(allText(tree)).toContain('Ninguém com marca nos 5 km ainda')
  })

  it('toque numa linha de atleta abre o perfil; a minha linha leva ao meu perfil', async () => {
    serve({
      [TEAMS]: teamsPage(), [PROFILES]: [],
      '/rankings?sport=tenis&limit=20': rankingPage({ ranking: 'tenis', format: null, items: [athleteRow(1, 31, 'Ana Souza'), athleteRow(2, 1, 'Carlos Lima', { is_mine: true })], classified_count: 2 }),
    })
    const { tree, navigation } = await mount({ sport: 'tenis' })
    await pressButton(tree, 'Abrir perfil de Ana Souza. Posição 1, Ana Souza, 8 partidas · 5V 2D, elo Ouro, 39 pontos')
    expect(navigation.go).toHaveBeenLastCalledWith('user-profile', { userId: 31 })
    const mineRow = rows(tree).find(row => typeof row.type === 'string' && String(row.props.accessibilityLabel).includes('Carlos Lima'))!
    await flush()
    mineRow.props.onPress()
    expect(navigation.go).toHaveBeenLastCalledWith('profile')
  })
})

describe('Ranking: paginação, estados vazios e erros', () => {
  it('"Carregar mais" lê a próxima página pelo cursor e acrescenta as linhas', async () => {
    serve({
      [TEAMS]: teamsPage({ next_cursor: 'c1' }), [PROFILES]: [],
      [`${TEAMS}&cursor=c1`]: teamsPage({ items: [rankingRow(3, 'Tigres do Lago', { tier: 'prata' })], next_cursor: null }),
    })
    const { tree } = await mount()
    expect(rows(tree).filter(row => typeof row.type === 'string')).toHaveLength(2)
    await pressButton(tree, 'Carregar mais')
    expect(callsTo('GET', `${TEAMS}&cursor=c1`)).toHaveLength(1)
    expect(rows(tree).filter(row => typeof row.type === 'string')).toHaveLength(3)
    expect(allText(tree)).toContain('Tigres do Lago')
    expect(findButton(tree, 'Carregar mais')).toBeUndefined()
  })

  it('falha ao carregar mais mantém a lista e mostra o erro; tentar de novo continua do mesmo cursor', async () => {
    let fail = true
    serve({
      [TEAMS]: teamsPage({ next_cursor: 'c1' }), [PROFILES]: [],
      [`${TEAMS}&cursor=c1`]: () => (fail ? new ApiError('Sem conexão com o servidor.', 0) : teamsPage({ items: [rankingRow(3, 'Tigres do Lago')], next_cursor: null })),
    })
    const { tree } = await mount()
    await pressButton(tree, 'Carregar mais')
    expect(allText(tree)).toContain('Sem conexão com o servidor.')
    expect(rows(tree).filter(row => typeof row.type === 'string')).toHaveLength(2)
    fail = false
    await pressButton(tree, 'Carregar mais')
    expect(rows(tree).filter(row => typeof row.type === 'string')).toHaveLength(3)
    expect(allText(tree)).not.toContain('Sem conexão com o servidor.')
  })

  it('sessão expirada (401) ao carregar mais chama onExpired', async () => {
    serve({ [TEAMS]: teamsPage({ next_cursor: 'c1' }), [PROFILES]: [], [`${TEAMS}&cursor=c1`]: new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    const { tree } = await mount(undefined, { onExpired: expired })
    await pressButton(tree, 'Carregar mais')
    expect(expired).toHaveBeenCalled()
    expect(rows(tree).filter(row => typeof row.type === 'string')).toHaveLength(2)
  })

  it('vazio honesto: sem classificados no futebol e na corrida, sem linhas nem pontos inventados', async () => {
    serve({
      [TEAMS]: teamsPage({ items: [], classified_count: 0, mine: [] }), [PROFILES]: [],
      '/rankings?sport=corrida&distance_km=5&limit=20': rankingPage({ ranking: 'corrida_5', items: [], classified_count: 0, required: 1 }),
    })
    const { tree, navigation } = await mount()
    expect(byId(tree, 'ranking-empty')).toHaveLength(1)
    expect(allText(tree)).toContain('Ninguém classificado ainda')
    expect(allText(tree)).toContain('São 3 partidas para sair da classificação.')
    expect(rows(tree)).toHaveLength(0)
    await pressButton(tree, 'Corrida')
    expect(allText(tree)).toContain('Ninguém com marca nos 5 km ainda')
    expect(allText(tree)).toContain('A primeira marca já classifica.')
    await pressButton(tree, 'Registrar uma corrida')
    expect(navigation.go).toHaveBeenCalledWith('play')
  })

  it('erro mostra a mensagem e "Tentar novamente" lê de novo; 401 expira a sessão', async () => {
    let fail = true
    serve({ [TEAMS]: () => (fail ? new ApiError('Não foi possível carregar o ranking.', 500) : teamsPage()), [PROFILES]: [] })
    const { tree } = await mount()
    expect(allText(tree)).toContain('Não foi possível carregar o ranking.')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Leões do Cerrado')
    serve({ [TEAMS]: new ApiError('Sessão expirada', 401), [PROFILES]: new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    await mount(undefined, { onExpired: expired })
    expect(expired).toHaveBeenCalled()
  })

  it('o erro é de tela (LoadError); se foi de conexão, diz isso e a lista é relida uma vez quando ela volta', async () => {
    let fail = true
    serve({ [TEAMS]: () => (fail ? new ApiError('Sem resposta.', 503) : teamsPage()), [PROFILES]: [] })
    const { tree } = await mount()
    expect(byId(tree, 'load-error-screen')).toHaveLength(1)
    expect(allText(tree)).toContain('Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.')
    expect(allText(tree)).not.toContain('Sem resposta.')
    fail = false
    await act(async () => { connection.lost({ mutating: false }); connection.reached() })
    await flush()
    expect(allText(tree)).toContain('Leões do Cerrado')
    expect(byId(tree, 'load-error-screen')).toHaveLength(0)
    expect(callsTo('GET', TEAMS)).toHaveLength(2)
  })

  it('carregando mostra o status; a resposta de uma categoria antiga não substitui a atual', async () => {
    let releaseSlow!: (value: RankingPage) => void
    const slow = new Promise<RankingPage>(resolve => { releaseSlow = resolve })
    serve({
      [TEAMS]: () => slow, [PROFILES]: [],
      '/rankings?sport=tenis&limit=20': rankingPage({ ranking: 'tenis', format: null, items: [athleteRow(1, 31, 'Ana Souza')], classified_count: 1 }),
    })
    const { tree } = await mount()
    expect(allText(tree)).toContain('Carregando ranking…')
    await pressButton(tree, 'Tênis')
    expect(allText(tree)).toContain('Ana Souza')
    releaseSlow(teamsPage())
    await flush()
    expect(allText(tree)).toContain('Ana Souza')
    expect(allText(tree)).not.toContain('Leões do Cerrado')
  })

  it('a lista de perfis fora do formato esperado não derruba a tela (posição padrão: atacante)', async () => {
    serve({
      [TEAMS]: teamsPage(), [PROFILES]: listPage([]),
      '/rankings?sport=futebol&kind=individual&format=society&position=atacante&limit=20': rankingPage({ ranking: 'futebol_individual', items: [], classified_count: 0 }),
    })
    const { tree } = await mount()
    await pressButton(tree, 'Individual')
    expect(callsTo('GET', '/rankings?sport=futebol&kind=individual&format=society&position=atacante&limit=20')).toHaveLength(1)
  })
})
