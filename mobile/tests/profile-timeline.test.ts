import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { ProfileStats, TimelineItem } from '../src/api/profile'
import { DuelCard } from '../src/components/profile-matches/DuelCard'
import { MatchTimeline } from '../src/components/profile-matches/MatchTimeline'
import { ProfileStatsBlocks } from '../src/components/profile-matches/ProfileStatsBlocks'
import { RunDuelCard } from '../src/components/profile-matches/RunDuelCard'
import { countLine, daysUntil, isFaded, matchBadge, monthLabel, nextMatchWhen, statsText } from '../src/components/profile-matches/timelineView'
import ProfileScreen from '../src/screens/ProfileScreen'
import UserProfileScreen from '../src/screens/UserProfileScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { matchCard, playContext } from './support/play'
import { fakeNavigation } from './support/teams'
import type { FakeNavigation } from './support/teams'
import { leoes, teamSides, tennisSides, timelineMatch, timelineRun } from './support/timeline'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/components/SportCard', () => ({ default: () => null }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  clearToken: vi.fn(),
  request: vi.fn(),
}))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const h = React.createElement
type Tree = ReturnType<typeof create>
const find = (tree: Tree, testID: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)
const page = (items: TimelineItem[], next: string | null = null, total = items.length) => ({ items, next_cursor: next, total })
const stats = (overrides: Partial<ProfileStats> = {}): ProfileStats => ({ played: 8, wins: 5, draws: 1, losses: 2, win_rate: 62.5, best_tier: 'ouro', in_placement: false, ...overrides })

async function render(element: React.ReactElement) {
  let tree!: Tree
  await act(async () => { tree = create(element) })
  return tree
}
const unmount = (tree: Tree) => act(async () => { tree.unmount() })

describe('DuelCard: a partida na linha do tempo', () => {
  beforeEach(enableAct)

  it('vitória de campeonato: faixa com troféu e fase, "você", vencedor, pontos, estatísticas e toque no perfil próprio', async () => {
    const onOpen = vi.fn()
    const match = timelineMatch({ origin: 'campeonato', event: { id: 3, name: 'Copa Sudoeste' }, round_label: 'Semifinal', stats: { position: 'atacante', goals: 1, assists: 1, position_stat: null } })
    const tree = await render(h(DuelCard, { match, own: true, onOpen }))
    const text = textOf(tree)
    expect(text).toContain('Vitória')
    expect(text).toContain('Copa Sudoeste')
    expect(text).toContain('· SEMIFINAL')
    expect(text).toContain('você')
    expect(text).toContain('Society')
    expect(text).toContain('+3')
    expect(text).toContain('1 gol · 1 assistência')
    expect(text).toContain('Arena Sudoeste')
    const card = find(tree, 'duel-card')[0]
    expect(card.props.accessibilityRole).toBe('button')
    expect(card.props.accessibilityLabel).toContain('Vitória, Ferrugem FC contra Leões do Cerrado, placar 3 a 1')
    expect(card.props.style.opacity).toBe(1)
    await act(async () => { card.props.onPress() })
    expect(onOpen).toHaveBeenCalledWith(100)
    await unmount(tree)
  })

  it('empate e derrota mostram selo e pontos de cada resultado', async () => {
    const draw = await render(h(DuelCard, { match: timelineMatch({ score: { a: 2, b: 2, sets: null, winner: null }, outcome: 'empate', points: 1 }), own: true }))
    expect(textOf(draw)).toContain('Empate')
    expect(textOf(draw)).toContain('+1')
    await unmount(draw)
    const loss = await render(h(DuelCard, { match: timelineMatch({ score: { a: 0, b: 1, sets: null, winner: 'b' }, outcome: 'derrota', points: 0, court: null }), own: true }))
    expect(textOf(loss)).toContain('Derrota')
    expect(textOf(loss)).not.toContain('Arena Sudoeste')
    expect(find(loss, 'event-band')).toHaveLength(0)
    expect(byLabel(loss, '0 pontos')).toHaveLength(1)
    await unmount(loss)
  })

  it('W.O.: o lado que faltou mostra "Ausente" no lugar do placar e o selo diz W.O.', async () => {
    const match = timelineMatch({ score: { a: 0, b: 3, sets: null, winner: 'b' }, outcome: 'derrota', walkover_absent_side: 'a', points: 0 })
    const tree = await render(h(DuelCard, { match, own: true }))
    expect(textOf(tree)).toContain('Derrota · W.O.')
    const rows = find(tree, 'duel-side')
    expect(find(tree, 'absent-tag')).toHaveLength(1)
    expect(rows[0].findAll(node => typeof node.type === 'string' && node.props.testID === 'absent-tag')).toHaveLength(1)
    expect(rows[1].findAll(node => typeof node.type === 'string' && node.props.testID === 'absent-tag')).toHaveLength(0)
    expect(textOf(tree)).toContain('Ausente')
    await unmount(tree)
  })

  it('tênis: uma coluna por set, tiebreak, +10 e, no perfil visitado, sem "você", sem quadra e sem toque', async () => {
    const match = timelineMatch({
      sport: 'tenis', format: null, sides: tennisSides, points: 10,
      score: { a: 2, b: 0, winner: 'a', sets: [{ a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false }, { a: 6, b: 3, tiebreak: null, super_tiebreak: false }] },
    })
    const tree = await render(h(DuelCard, { match, own: false }))
    expect(find(tree, 'set-cell')).toHaveLength(4)
    // Tie-break só no lado que perdeu o set: o 6 do lado B no primeiro set leva o expoente.
    expect(find(tree, 'set-cell').map(cell => cell.findAll(node => typeof node.type === 'string' && node !== cell).length)).toEqual([0, 0, 1, 0])
    expect(textOf(tree)).toContain('+10')
    expect(textOf(tree)).toContain('Tênis')
    expect(textOf(tree)).not.toContain('você')
    expect(textOf(tree)).not.toContain('Arena Sudoeste')
    expect(find(tree, 'duel-card')[0].props.onPress).toBeUndefined()
    expect(tree.root.findAllByType('Pressable' as never)).toHaveLength(0)
    await unmount(tree)
  })

  it('cancelada e sem resultado ficam esmaecidas, com "–" e selo tracejado', async () => {
    const canceled = await render(h(DuelCard, { match: timelineMatch({ state: 'cancelada', score: null, outcome: null, points: null }), own: true }))
    expect(textOf(canceled)).toContain('Cancelada')
    expect(textOf(canceled)).toContain('–')
    expect(find(canceled, 'badge-dashed')).toHaveLength(1)
    expect(find(canceled, 'duel-card')[0].props.style.opacity).toBeLessThan(1)
    await unmount(canceled)
    const none = await render(h(DuelCard, { match: timelineMatch({ state: 'sem_resultado', score: null, outcome: null, points: null }), own: true }))
    expect(textOf(none)).toContain('Sem resultado')
    expect(find(none, 'badge-dashed')).toHaveLength(1)
    await unmount(none)
  })

  it('o lado único (adversário a definir) e a posição sem nome não quebram o cartão', async () => {
    const tree = await render(h(DuelCard, { match: timelineMatch({ sides: [{ side: 'a', kind: 'atleta', team: null, athlete: null, is_owner: true }], score: null, outcome: null, points: null, state: 'cancelada' }), own: true }))
    expect(textOf(tree)).toContain('Adversário')
    await unmount(tree)
  })
})

describe('RunDuelCard: a corrida contra a própria marca', () => {
  beforeEach(enableAct)

  it('novo melhor: esta marca contra o melhor anterior, com a origem do treino', async () => {
    const tree = await render(h(RunDuelCard, { run: timelineRun() }))
    const text = textOf(tree)
    expect(text).toContain('Novo melhor')
    expect(text).toContain('ESTA MARCA')
    expect(text).toContain('5 km')
    expect(text).toContain('25:12')
    expect(text).toContain('MELHOR ANTERIOR')
    expect(text).toContain('26:00')
    expect(text).toContain('Treino')
    expect(tree.root.findAllByType('Pressable' as never)).toHaveLength(0)
    await unmount(tree)
  })

  it('primeira marca: "Sem marca anterior" e a origem da prova', async () => {
    const tree = await render(h(RunDuelCard, { run: timelineRun({ mark_kind: 'primeira_marca', previous_best_s: null, origin: { source: 'prova', label: 'Corrida do Cerrado', event_id: 4 } }) }))
    expect(textOf(tree)).toContain('Primeira marca')
    expect(textOf(tree)).toContain('Sem marca anterior')
    expect(textOf(tree)).toContain('Prova · Corrida do Cerrado')
    await unmount(tree)
  })

  it('sem melhora não tem selo; fora das faixas não tem comparação', async () => {
    const same = await render(h(RunDuelCard, { run: timelineRun({ mark_kind: 'sem_melhora', previous_best_s: 1400 }) }))
    expect(find(same, 'state-badge-open')).toHaveLength(0)
    expect(textOf(same)).toContain('23:20')
    await unmount(same)
    const out = await render(h(RunDuelCard, { run: timelineRun({ distance_m: 7500, standard_distance_km: null, mark_kind: null, previous_best_s: null }) }))
    expect(textOf(out)).toContain('7,5 km')
    expect(textOf(out)).not.toContain('MELHOR ANTERIOR')
    expect(find(out, 'state-badge-open')).toHaveLength(0)
    await unmount(out)
  })
})

describe('textos da linha do tempo', () => {
  it('esmaece só sem resultado e cancelada; placar confirmado com a janela aberta (realizada) não', () => {
    expect(isFaded({ state: 'realizada' })).toBe(false)
    expect(isFaded({ state: 'encerrada' })).toBe(false)
    expect(isFaded({ state: 'sem_resultado' })).toBe(true)
    expect(isFaded({ state: 'cancelada' })).toBe(true)
  })

  it('contagem, selos, estatísticas e meses', () => {
    expect(countLine(1, null)).toBe('1 registro · Todas as modalidades')
    expect(countLine(12, 'tenis')).toBe('12 registros · Tênis')
    expect(matchBadge({ state: 'encerrada', outcome: null, walkover_absent_side: null })).toBeNull()
    expect(matchBadge({ state: 'encerrada', outcome: 'vitoria', walkover_absent_side: 'b' })?.label).toBe('Vitória · W.O.')
    expect(statsText(null)).toBeNull()
    expect(statsText({ position: 'defesa', goals: null, assists: null, position_stat: null })).toBeNull()
    expect(statsText({ position: 'defesa', goals: 2, assists: 0, position_stat: 3 })).toBe('2 gols · 3 desarmes')
    expect(statsText({ position: null, goals: 0, assists: 0, position_stat: 2 })).toBe('2 ações da posição')
    expect(statsText({ position: null, goals: 0, assists: 0, position_stat: 1 })).toBe('1 ação da posição')
    expect(statsText({ position: 'goleiro', goals: 1, assists: 2, position_stat: 1 })).toBe('1 gol · 2 assistências · 1 defesa')
    expect(monthLabel(timelineRun({ date: '2026-09-30', occurred_at: '2026-09-30T00:00:00Z' }))).toBe('setembro 2026')
    expect(monthLabel(timelineMatch({ occurred_at: 'invalida' }))).toBe('')
  })

  it('"Em N dias", "Amanhã" e "Hoje" pelo calendário local', () => {
    const now = new Date(2026, 9, 12, 10, 0)
    expect(daysUntil(new Date(2026, 9, 12, 20, 0).toISOString(), now)).toBe('Hoje')
    expect(daysUntil(new Date(2026, 9, 13, 8, 0).toISOString(), now)).toBe('Amanhã')
    expect(daysUntil(new Date(2026, 9, 17, 16, 0).toISOString(), now)).toBe('Em 5 dias')
    expect(daysUntil('x', now)).toBe('')
    expect(nextMatchWhen(new Date(2026, 9, 17, 16, 0).toISOString(), now)).toBe('Em 5 dias · sáb, 17 out, 16:00')
    expect(nextMatchWhen('x', now)).toBe('Data a definir')
  })
})

describe('MatchTimeline: a aba Partidas', () => {
  const onExpired = vi.fn()
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); onExpired.mockReset() })
  const items: TimelineItem[] = [
    timelineMatch({ id: 1, occurred_at: '2026-10-10T19:00:00Z' }),
    timelineRun({ id: 2, date: '2026-10-05' }),
    timelineMatch({ id: 3, occurred_at: '2026-09-20T19:00:00Z', outcome: 'derrota', score: { a: 0, b: 2, sets: null, winner: 'b' }, points: 0, sides: teamSides('b') }),
  ]
  const mountTimeline = (props: Partial<React.ComponentProps<typeof MatchTimeline>> = {}) =>
    render(h(MatchTimeline, { userId: 1, own: true, onExpired, onOpenMatch: vi.fn(), onPlay: vi.fn(), ...props }))

  it('mostra o esqueleto de 3 cartões enquanto carrega', async () => {
    vi.mocked(request).mockImplementation(() => new Promise(() => undefined))
    const tree = await mountTimeline()
    expect(find(tree, 'timeline-skeleton')).toHaveLength(3)
    expect(byLabel(tree, 'Carregando partidas')[0].props.accessibilityLiveRegion).toBe('polite')
    expect(byLabel(tree, 'Filtrar por modalidade')).toHaveLength(1)
    await unmount(tree)
  })

  it('lista a linha do tempo com separadores de mês, contagem e toque nas partidas (corrida não é tocável)', async () => {
    vi.mocked(request).mockResolvedValue(page(items, null, 3) as never)
    const onOpenMatch = vi.fn()
    const tree = await mountTimeline({ onOpenMatch })
    expect(request).toHaveBeenCalledWith('/users/1/timeline')
    const text = textOf(tree)
    expect(text).toContain('3 registros · Todas as modalidades')
    expect(text).toContain('outubro 2026')
    expect(text).toContain('setembro 2026')
    expect(find(tree, 'duel-card')).toHaveLength(2)
    expect(find(tree, 'run-duel-card')).toHaveLength(1)
    expect(find(tree, 'timeline-rail')).toHaveLength(1)
    expect(tree.root.findAllByType('FlatList' as never)).toHaveLength(0)
    await act(async () => { find(tree, 'duel-card')[1].props.onPress() })
    expect(onOpenMatch).toHaveBeenCalledWith(3)
    expect(byLabel(tree, 'Carregar mais')).toHaveLength(0)
    await unmount(tree)
  })

  it('"Carregar mais" lê a próxima página pelo cursor e some no fim', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('cursor=c2') ? page([items[2]], null, 3) : page([items[0], items[1]], 'c2', 3)) as never)
    const tree = await mountTimeline()
    expect(find(tree, 'duel-card')).toHaveLength(1)
    await press(tree, 'Carregar mais')
    expect(request).toHaveBeenCalledWith('/users/1/timeline?cursor=c2')
    expect(find(tree, 'duel-card')).toHaveLength(2)
    expect(byLabel(tree, 'Carregar mais')).toHaveLength(0)
    await unmount(tree)
  })

  it('o ícone de filtro abre a folha, filtra por modalidade, mostra o ponto e o nome no topo, e Todas limpa o filtro', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('sport=tenis') ? page([timelineMatch({ id: 9, sport: 'tenis', format: null, sides: tennisSides, points: 10 })], null, 1) : page(items, null, 3)) as never)
    const tree = await mountTimeline()
    expect(find(tree, 'filter-dot')).toHaveLength(0)
    await press(tree, 'Filtrar por modalidade')
    const radios = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
    expect(radios.map(radio => radio.props.accessibilityLabel)).toEqual(['Todas', 'Futebol', 'Tênis', 'Corrida'])
    expect(radios[0].props.accessibilityState.checked).toBe(true)
    await press(tree, 'Tênis')
    expect(request).toHaveBeenCalledWith('/users/1/timeline?sport=tenis')
    expect(textOf(tree)).toContain('1 registro · Tênis')
    expect(find(tree, 'filter-dot')).toHaveLength(1)
    expect(byLabel(tree, 'Filtrar por modalidade')[0].props.accessibilityHint).toBe('Filtro ativo: Tênis')
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'radio')).toHaveLength(0)
    await press(tree, 'Filtrar por modalidade')
    await press(tree, 'Todas')
    expect(textOf(tree)).toContain('3 registros · Todas as modalidades')
    expect(find(tree, 'filter-dot')).toHaveLength(0)
    await unmount(tree)
  })

  it('filtro sem registros mostra o vazio do filtro', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('sport=corrida') ? page([], null, 0) : page(items, null, 3)) as never)
    const tree = await mountTimeline()
    await press(tree, 'Filtrar por modalidade')
    await press(tree, 'Corrida')
    expect(textOf(tree)).toContain('Nenhum registro nesta modalidade.')
    expect(textOf(tree)).toContain('0 registros · Corrida')
    await unmount(tree)
  })

  it('vazio próprio convida a jogar; vazio do visitante diz "Nenhuma partida por aqui"', async () => {
    vi.mocked(request).mockResolvedValue(page([]) as never)
    const onPlay = vi.fn()
    const own = await mountTimeline({ onPlay })
    expect(textOf(own)).toContain('Sua história em campo começa aqui')
    await press(own, 'Jogar')
    expect(onPlay).toHaveBeenCalledOnce()
    await unmount(own)
    const visitor = await mountTimeline({ own: false })
    expect(textOf(visitor)).toContain('Nenhuma partida por aqui')
    expect(byLabel(visitor, 'Jogar')).toHaveLength(0)
    await unmount(visitor)
  })

  it('404 do visitante (sem acesso) vira o vazio de visitante, sem erro', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Não encontrado', 404))
    const tree = await mountTimeline({ own: false })
    expect(textOf(tree)).toContain('Nenhuma partida por aqui')
    expect(byLabel(tree, 'Tentar novamente')).toHaveLength(0)
    await unmount(tree)
  })

  it('erro mostra a mensagem e "Tentar novamente" lê de novo; 401 chama onExpired', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('Falha de rede.')).mockResolvedValue(page(items, null, 3) as never)
    const tree = await mountTimeline()
    expect(textOf(tree)).toContain('Falha de rede.')
    await press(tree, 'Tentar novamente')
    expect(find(tree, 'duel-card')).toHaveLength(2)
    await unmount(tree)
    vi.mocked(request).mockReset().mockRejectedValue(new ApiError('Sessão expirada', 401))
    const expired = await mountTimeline()
    expect(onExpired).toHaveBeenCalledOnce()
    await unmount(expired)
  })

  it('404 no perfil próprio é erro (não vazio de visitante)', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Não encontrado', 404))
    const tree = await mountTimeline()
    expect(textOf(tree)).toContain('Não encontrado')
    expect(byLabel(tree, 'Tentar novamente')).toHaveLength(1)
    await unmount(tree)
  })

  it('a próxima partida é o primeiro nó, só no perfil próprio, e leva à partida', async () => {
    vi.mocked(request).mockResolvedValue(page(items, null, 3) as never)
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const upcoming = [matchCard({ id: 77, state: 'agendada', phase: 'agendada', starts_at: start, court: { id: 7, name: 'Arena Sudoeste', address: null, kind: 'society', city: { id: 1, name: 'Brasília', state: 'DF' }, state: 'publicada', provisional: false } }),
      matchCard({ id: 78, state: 'agendada', phase: 'agendada', starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString() })]
    const onOpenMatch = vi.fn()
    const own = await mountTimeline({ upcoming, onOpenMatch })
    expect(textOf(own)).toContain('PRÓXIMA PARTIDA')
    expect(textOf(own)).toContain('Em 3 dias')
    expect(textOf(own)).toContain('Society · Amistoso · Arena Sudoeste')
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { find(own, 'next-match')[0].props.onPress() })
    expect(onOpenMatch).toHaveBeenCalledWith(77)
    await unmount(own)
    const visitor = await mountTimeline({ own: false, upcoming })
    expect(textOf(visitor)).not.toContain('PRÓXIMA PARTIDA')
    expect(find(visitor, 'next-match')).toHaveLength(0)
    await unmount(visitor)
  })

  it('perfil próprio sem registros, mas com próxima partida, mostra só o nó da próxima', async () => {
    vi.mocked(request).mockResolvedValue(page([]) as never)
    const upcoming = [matchCard({ id: 77, state: 'agendada', phase: 'agendada', starts_at: new Date(Date.now() + 86_400_000 * 2).toISOString() })]
    const tree = await mountTimeline({ upcoming })
    expect(find(tree, 'next-match')).toHaveLength(1)
    expect(textOf(tree)).not.toContain('Sua história em campo começa aqui')
    await unmount(tree)
  })

  it('no perfil visitado nenhuma partida é tocável', async () => {
    vi.mocked(request).mockResolvedValue(page(items, null, 3) as never)
    const onOpenMatch = vi.fn()
    const tree = await mountTimeline({ own: false, onOpenMatch })
    expect(find(tree, 'duel-card')).toHaveLength(2)
    expect(find(tree, 'duel-card').every(card => card.props.onPress === undefined)).toBe(true)
    expect(textOf(tree)).not.toContain('você')
    expect(textOf(tree)).not.toContain('Arena Sudoeste')
    await unmount(tree)
  })

  it('filtro Corrida oculta a próxima partida de futebol, mesmo com corridas no histórico', async () => {
    vi.mocked(request).mockResolvedValue(page([timelineRun()]) as never)
    const upcoming = [matchCard({ id: 77, sport: 'futebol', state: 'agendada', phase: 'agendada', starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString() })]
    const tree = await mountTimeline({ upcoming })
    expect(find(tree, 'next-match')).toHaveLength(1)
    await press(tree, 'Filtrar por modalidade')
    await press(tree, 'Corrida')
    expect(find(tree, 'next-match')).toHaveLength(0)
    expect(find(tree, 'run-duel-card')).toHaveLength(1)
    await unmount(tree)
  })

  it('mantém a próxima partida da modalidade selecionada mesmo sem histórico nesse filtro', async () => {
    vi.mocked(request).mockResolvedValue(page([]) as never)
    const upcoming = [matchCard({ id: 77, sport: 'tenis', state: 'agendada', phase: 'agendada', starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString() })]
    const tree = await mountTimeline({ upcoming })
    await press(tree, 'Filtrar por modalidade')
    await press(tree, 'Tênis')
    expect(find(tree, 'next-match')).toHaveLength(1)
    expect(textOf(tree)).not.toContain('Nenhum registro nesta modalidade.')
    await press(tree, 'Filtrar por modalidade')
    await press(tree, 'Futebol')
    expect(find(tree, 'next-match')).toHaveLength(0)
    expect(textOf(tree)).toContain('Nenhum registro nesta modalidade.')
    await unmount(tree)
  })
})

describe('ProfileStatsBlocks: Taxa de vitória, Partidas e Melhor elo', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset() })

  it('mostra a taxa arredondada, as partidas e o elo mais alto', async () => {
    vi.mocked(request).mockResolvedValue(stats() as never)
    const tree = await render(h(ProfileStatsBlocks, { onExpired: vi.fn() }))
    expect(request).toHaveBeenCalledWith('/me/profile-stats')
    expect(byLabel(tree, 'Taxa de vitória: 63%')).toHaveLength(1)
    expect(byLabel(tree, 'Partidas: 8')).toHaveLength(1)
    expect(byLabel(tree, 'Melhor elo: Ouro')).toHaveLength(1)
    await unmount(tree)
  })

  it('em classificação não recebe elo; sem partidas mostra "—"', async () => {
    vi.mocked(request).mockResolvedValue(stats({ played: 0, wins: 0, draws: 0, losses: 0, win_rate: null, best_tier: null, in_placement: true }) as never)
    const tree = await render(h(ProfileStatsBlocks, { onExpired: vi.fn() }))
    expect(byLabel(tree, 'Taxa de vitória: —')).toHaveLength(1)
    expect(byLabel(tree, 'Partidas: 0')).toHaveLength(1)
    expect(byLabel(tree, 'Melhor elo: Em classificação')).toHaveLength(1)
    await unmount(tree)
    vi.mocked(request).mockResolvedValue(stats({ best_tier: null, in_placement: false }) as never)
    const none = await render(h(ProfileStatsBlocks, { onExpired: vi.fn() }))
    expect(byLabel(none, 'Melhor elo: —')).toHaveLength(1)
    await unmount(none)
  })

  it('erro não bloqueia: os blocos ficam com "—" e o aviso aparece; 401 chama onExpired', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    const onExpired = vi.fn()
    const tree = await render(h(ProfileStatsBlocks, { onExpired }))
    expect(onExpired).toHaveBeenCalledOnce()
    expect(byLabel(tree, 'Partidas: —')).toHaveLength(1)
    expect(byLabel(tree, 'Taxa de vitória: —')).toHaveLength(1)
    expect(textOf(tree)).toContain('Sessão expirada')
    await unmount(tree)
  })
})

describe('telas de perfil com a aba Partidas', () => {
  const me = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
  const meSocial = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', avatar_url: null, cover_url: null, social_public: true, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self' as const }
  let navigation: FakeNavigation
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); navigation = fakeNavigation() })

  it('perfil próprio: blocos de estatística e a linha do tempo na aba Partidas; o toque abre a partida', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/cities' || path === '/me/sports-profiles') return [] as never
      if (path === '/users/1') return meSocial as never
      if (path === '/me/profile-stats') return stats() as never
      if (path === '/users/1/timeline') return page([timelineMatch({ id: 31 }), timelineRun()]) as never
      return { items: [], next_cursor: null } as never
    })
    const onOpenMatch = vi.fn()
    const tree = await render(h(ProfileScreen, { user: me, onExpired: vi.fn(), onLogout: vi.fn(), onUser: vi.fn(), onOpenMatch, onPlay: vi.fn() }))
    expect(byLabel(tree, 'Melhor elo: Ouro')).toHaveLength(1)
    expect(request).not.toHaveBeenCalledWith('/users/1/timeline')
    await press(tree, 'Partidas')
    expect(request).toHaveBeenCalledWith('/users/1/timeline')
    expect(find(tree, 'duel-card')).toHaveLength(1)
    await act(async () => { find(tree, 'duel-card')[0].props.onPress() })
    expect(onOpenMatch).toHaveBeenCalledWith(31)
    await unmount(tree)
  })

  it('perfil visitado: aba Partidas sem próxima partida nem toque; 404 vira vazio de visitante', async () => {
    const ana = { ...meSocial, id: 5, name: 'Ana Lima', username: 'ana.lima', follow_state: 'none' as const }
    let timeline: () => unknown = () => page([timelineMatch({ id: 40, sides: [{ ...teamSides()[0], is_owner: true }, { side: 'b', kind: 'time', team: leoes, athlete: null, is_owner: false }] })])
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/users/5') return ana as never
      if (path === '/users/5/timeline') return timeline() as never
      if (path.startsWith('/users/5/mutual-followers')) return { items: [], total: 0, next_cursor: null } as never
      return { items: [], next_cursor: null } as never
    })
    const mountVisited = () => render(h(UserProfileScreen, { user: me, navigation: navigation as never, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired: vi.fn(), params: { userId: 5 }, title: 'Perfil' }))
    const tree = await mountVisited()
    await press(tree, 'Partidas')
    expect(find(tree, 'duel-card')).toHaveLength(1)
    expect(find(tree, 'duel-card')[0].props.onPress).toBeUndefined()
    expect(find(tree, 'next-match')).toHaveLength(0)
    expect(navigation.go).not.toHaveBeenCalled()
    await unmount(tree)
    timeline = () => { throw new ApiError('Não encontrado', 404) }
    const hidden = await mountVisited()
    await press(hidden, 'Partidas')
    expect(textOf(hidden)).toContain('Nenhuma partida por aqui')
    await unmount(hidden)
  })
})

