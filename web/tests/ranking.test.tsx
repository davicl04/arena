import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { RankingRow } from '../src/api/results'
import { getRankingOverview, getRankings, rankingOverviewPath, rankingPath } from '../src/api/results'
import { categoryDetail, categoryQuery, categoryText, rankingKey, subjectNoun } from '../src/components/ranking/category'
import type { RankingState } from '../src/components/ranking/category'
import { dayMonth, formatMetric, gapText } from '../src/components/ranking/metric'
import { collapsedEntries, expandedEntries } from '../src/components/ranking/windowEntries'
import ArenaPage from '../src/pages/ArenaPage'
import RankingPage from '../src/pages/RankingPage'
import { athleteRow, leoes, myLine, rankingOverview, rankingPage, rankingRow, tierCounts, unrankedLine } from './results-fixtures'
import { apiError, brasilia, mockApi, person } from './teams-fixtures'
import { summaryOf } from './notifications-fixtures'

afterEach(cleanup)

const profile = (sport: Profile['sport'], position: Profile['position'] = null): Profile =>
  ({ id: 1, sport, city_id: 5300108, position, looking_for: false, is_public: false, level: null })
const football = profile('futebol', 'goleiro')

const base = '/rankings?sport=futebol&kind=time&format=society'
const OV = '/rankings/overview?sport=futebol&kind=time&format=society'
const top = (tier: string) => `${base}&tier=${tier}&limit=6`
const whole = (tier: string, cursor?: string) => `${base}&tier=${tier}&limit=20${cursor ? `&cursor=${cursor}` : ''}`

/** Linha do Diamante na posição `tp` do elo (a posição geral é outra, de propósito: ela não aparece na tela). */
const diamond = (tp: number, overrides: Partial<RankingRow> = {}): RankingRow =>
  rankingRow(tp, tp === 6 ? 'Leões do Cerrado' : `Time ${tp}`, {
    tier: 'diamante', rank_position: tp + 40, metric_value: 100 - tp * 3, ...(tp === 6 ? { is_mine: true, team: leoes } : {}), ...overrides,
  })
const range = (from: number, to: number, make: (tp: number) => RankingRow = diamond) =>
  Array.from({ length: to - from + 1 }, (_, index) => make(from + index))

/** Overview do titular no 6º de 12 do Diamante, com a janela de `tier_position − 3` a `+ 3`. */
const diamondOverview = (overrides = {}) => rankingOverview({ window: range(3, 9), ...overrides })

function setup(
  routes: Parameters<typeof mockApi>[0],
  profiles: Profile[] = [football],
  props: Partial<Parameters<typeof RankingPage>[0]> = {},
) {
  const api = mockApi(routes)
  const go = vi.fn()
  const onOpenUser = vi.fn()
  const onExpired = vi.fn()
  render(<RankingPage profiles={profiles} go={go} onOpenUser={onOpenUser} onExpired={onExpired} {...props} />)
  return { api, go, onOpenUser, onExpired }
}
const plate = (tier = 'Diamante') => screen.getByRole('region', { name: `Ranking no ${tier}` })
const hero = () => screen.getByRole('region', { name: 'Sua posição' })
const positions = (rows: HTMLElement[]) => rows.map(row => (row.querySelector('span.font-display')?.textContent ?? '').replace('Posição no elo ', ''))

describe('Ranking · placa contínua do elo', () => {
  it('mostra a posição no elo, a métrica e as diferenças, com duas linhas acima e abaixo e sem a posição geral', async () => {
    const { api } = setup({ [`GET ${OV}`]: diamondOverview() })
    const card = await screen.findByRole('button', { name: /Categoria/ })
    expect(card.textContent).toContain('Futebol · Society 7×7 · Times')
    const info = await screen.findByRole('region', { name: 'Sua posição' })
    expect(info.textContent).toContain('Sua posição no Diamante')
    expect(info.querySelector('div.font-display')?.textContent).toBe('6º')
    expect(info.textContent).toContain('de 12 no Diamante · Leões do Cerrado')
    expect(info.textContent).toContain('94 pontos')
    expect(info.textContent).toContain('7 pts atrás do 1º')
    expect(info.textContent).toContain('1 pt à frente do 7º')
    // A janela: o titular com 2 acima e 2 abaixo; as pontas do overview viram a linha esmaecida (fora da árvore de acessibilidade).
    const rows = within(plate()).getAllByRole('listitem')
    expect(positions(rows)).toEqual(['4', '5', '6', '7', '8'])
    expect(rows[2].getAttribute('aria-current')).toBe('true')
    expect(within(rows[2]).getByText('Seu time')).not.toBeNull()
    expect(within(plate()).getByRole('button', { name: 'Ver 3 times acima' }).textContent).toBe('3')
    expect(within(plate()).getByRole('button', { name: 'Ver 4 times abaixo' }).textContent).toBe('4')
    // Nada da posição geral (46º do titular) nem de "Top %".
    expect(plate().textContent).not.toMatch(/\b4[1-9]\b/)
    expect(screen.queryByText(/Top \d+%|posição geral/i)).toBeNull()
    expect(api.calls.map(call => call.path)).toEqual([OV])
  })

  it('o líder diz "Lidera o Diamante" e o último, "Último do Diamante"', async () => {
    const leader = (tp: number) => diamond(tp, tp === 1 ? { is_mine: true, team: leoes } : { is_mine: false })
    setup({ [`GET ${OV}`]: rankingOverview({ mine: [myLine({ tier_position: 1, rank_position: 2, leader_gap: null, next_gap: 4, next_tier_position: 2 })], window: range(1, 4, leader) }) })
    const first = await screen.findByRole('region', { name: 'Sua posição' })
    expect(first.textContent).toContain('Lidera o Diamante')
    expect(first.textContent).toContain('4 pts à frente do 2º')
    expect(first.textContent).not.toContain('Último')
    cleanup()
    const lastRow = (tp: number) => diamond(tp, tp === 12 ? { is_mine: true, team: leoes } : { is_mine: false })
    setup({ [`GET ${OV}`]: rankingOverview({ mine: [myLine({ tier_position: 12, leader_gap: 36, next_gap: null, next_tier_position: null })], window: range(9, 12, lastRow) }) })
    const last = await screen.findByRole('region', { name: 'Sua posição' })
    expect(last.textContent).toContain('36 pts atrás do 1º')
    expect(last.textContent).toContain('Último do Diamante')
    // Sem linhas abaixo, não há borda para baixo; acima ainda há 7 escondidas.
    expect(within(plate()).queryByRole('button', { name: /abaixo/ })).toBeNull()
    expect(within(plate()).getByRole('button', { name: 'Ver 9 times acima' })).not.toBeNull()
  })

  it('na corrida as diferenças são tempos, a linha mostra a melhor marca e não há forma', async () => {
    const run = '/rankings/overview?sport=corrida&distance_km=5'
    const runner = (tp: number, overrides: Partial<RankingRow> = {}) =>
      athleteRow(tp, 40 + tp, `Corredor ${tp}`, { tier: 'ouro', tier_position: tp, rank_position: tp + 20, metric_value: 1250 + tp * 20, form: null, best_mark_on: '2026-09-03', matches_played: 2, ...overrides })
    setup({
      [`GET ${run}`]: rankingOverview({
        ranking: 'corrida_5', format: null, distance_km: 5, required: 1, legend_slots: 0, tier_counts: tierCounts({ ouro: 4 }),
        mine: [myLine({ team: null, tier: 'ouro', tier_position: 3, tier_size: 4, rank_position: 23, metric_value: 1310, leader_gap: 42, next_gap: 20, next_tier_position: 4 })],
        selected_team_id: null, window: [runner(1), runner(2), runner(3, { is_mine: true, athlete: person(43, 'Ricardo Moura') }), runner(4)],
      }),
    }, [profile('corrida')])
    const info = await screen.findByRole('region', { name: 'Sua posição' })
    expect(info.textContent).toContain('21:50')
    expect(info.textContent).toContain('tempo')
    expect(info.textContent).toContain('0:42 atrás do 1º')
    expect(info.textContent).toContain('0:20 à frente do 4º')
    const rows = within(plate('Ouro')).getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0].textContent).toContain('melhor marca em 03/09')
    expect(within(rows[0]).queryByRole('img', { name: /Últimos resultados/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Categoria/ }).textContent).toContain('Corrida · 5 km')
  })

  it('a forma recente mostra os resultados do mais antigo ao mais recente, com o nome acessível por extenso', async () => {
    setup({ [`GET ${OV}`]: diamondOverview({ window: range(3, 9, tp => diamond(tp, tp === 5 ? { form: ['D', 'V', 'E'] } : tp === 7 ? { form: null } : {})) }) })
    await screen.findByRole('region', { name: 'Sua posição' })
    const rows = within(plate()).getAllByRole('listitem')
    const full = within(rows[0]).getByRole('img', { name: 'Últimos resultados: vitória, vitória, empate, derrota, vitória' })
    expect(full.textContent).toBe('VVEDV')
    const short = within(rows[1]).getByRole('img', { name: 'Últimos resultados: derrota, vitória, empate' })
    expect(short.textContent).toBe('DVE')
    expect(within(rows[3]).queryByRole('img')).toBeNull()
  })

  it('o tênis mostra só vitória e derrota', async () => {
    setup({
      'GET /rankings/overview?sport=tenis': rankingOverview({
        ranking: 'tenis', format: null, tier_counts: tierCounts({ prata: 2 }), legend_slots: 0,
        mine: [myLine({ team: null, tier: 'prata', tier_position: 2, tier_size: 2, leader_gap: 3, next_gap: null, next_tier_position: null })], selected_team_id: null,
        window: [athleteRow(1, 50, 'Ana Souza', { tier: 'prata', form: ['V', 'D', 'V'] }), athleteRow(2, 51, 'Beatriz Lima', { tier: 'prata', is_mine: true, form: ['D', 'D', 'V'], tier_position: 2 })],
      }),
    }, [profile('tenis')])
    await screen.findByRole('region', { name: 'Sua posição' })
    const rows = within(plate('Prata')).getAllByRole('listitem')
    expect(within(rows[0]).getByRole('img').getAttribute('aria-label')).toBe('Últimos resultados: vitória, derrota, vitória')
    expect(within(rows[0]).getByRole('img').textContent).not.toContain('E')
  })
})

describe('Ranking · troca de elo e Salão', () => {
  const overview = () => diamondOverview({
    tier_counts: tierCounts({ bronze: 3, prata: 0, ouro: 2, diamante: 12, lendario: 1 }),
    legends_preview: [{ team: { id: 1, name: 'Ferrugem FC', initials: 'FF', crest_url: null }, athlete: null }],
  })

  it('as setas pulam os elos vazios e mostram os 5 primeiros do outro elo', async () => {
    const ui = userEvent.setup()
    const { api } = setup({
      [`GET ${OV}`]: overview(),
      [`GET ${top('ouro')}`]: rankingPage({ tier_counts: tierCounts({ ouro: 2 }), items: [rankingRow(1, 'Gigantes', { tier_position: 1 }), rankingRow(2, 'Ferrugem FC', { tier_position: 2 })] }),
      [`GET ${top('bronze')}`]: rankingPage({ tier_counts: tierCounts({ bronze: 3 }), items: [1, 2, 3].map(tp => rankingRow(tp, `Bronze ${tp}`, { tier: 'bronze' })) }),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    // Do Diamante, a seta de baixo vai ao Ouro (a Prata está vazia).
    await ui.click(screen.getByRole('button', { name: 'Ver elo Ouro' }))
    expect(await screen.findByText('Você está no Diamante. Os 2 primeiros no Ouro:')).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Sua posição' })).toBeNull()
    expect(within(plate('Ouro')).getAllByRole('listitem').map(row => row.textContent)).toEqual([expect.stringContaining('Gigantes'), expect.stringContaining('Ferrugem FC')])
    // Pelo Ouro, a seta de baixo pula a Prata e vai ao Bronze.
    await ui.click(screen.getByRole('button', { name: 'Ver elo Bronze' }))
    expect(await screen.findByText('Você está no Diamante. Os 3 primeiros no Bronze:')).not.toBeNull()
    expect(api.calls.map(call => call.path)).toEqual([OV, top('ouro'), top('bronze')])
    // Sem elo abaixo do Bronze, a seta fica desabilitada; para cima, volta ao Ouro (a Prata está vazia).
    expect(screen.getByRole('button', { name: 'Sem elo abaixo' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Ver elo Ouro' })).not.toBeNull()
  })

  it('a seta do Diamante para cima abre o Salão, com a categoria', async () => {
    const ui = userEvent.setup()
    const { go } = setup({ [`GET ${OV}`]: overview() })
    await screen.findByRole('region', { name: 'Sua posição' })
    const open = screen.getByRole('button', { name: 'Abrir o Salão dos Lendários' })
    expect(open.textContent).toContain('Salão')
    await ui.click(open)
    expect(go).toHaveBeenCalledWith('legends', { ranking: expect.objectContaining({ sport: 'futebol', kind: 'time', format: 'society', teamId: null }) })
  })

  it('a entrada do Salão mostra a contagem, os escudos e abre a subtela; sem Lendário, o cartão discreto explica', async () => {
    const ui = userEvent.setup()
    const { go } = setup({ [`GET ${OV}`]: overview() })
    const entry = await screen.findByRole('button', { name: /SALÃO DOS LENDÁRIOS/ })
    expect(entry.textContent).toContain('1 Lendário')
    await ui.click(entry)
    expect(go).toHaveBeenCalledWith('legends', expect.anything())
    cleanup()
    setup({ [`GET ${OV}`]: diamondOverview({ tier_counts: tierCounts({ diamante: 12, bronze: 3 }), legend_slots: 0 }) })
    expect(await screen.findByText('Nenhum Lendário ainda')).not.toBeNull()
    expect(screen.getByText(/As vagas abrem com 7 classificados \(15%\), entre quem tem os pontos de Diamante/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /SALÃO DOS LENDÁRIOS/ })).toBeNull()
  })

  it('o titular Lendário vê "Você está no Salão" e a placa no tom do Salão', async () => {
    const legend = (tp: number) => diamond(tp, { tier: 'lendario', ...(tp === 2 ? { is_mine: true, team: leoes } : { is_mine: false }) })
    setup({
      [`GET ${OV}`]: rankingOverview({
        tier_counts: tierCounts({ diamante: 4, lendario: 3 }), mine: [myLine({ tier: 'lendario', tier_position: 2, tier_size: 3, leader_gap: 5, next_gap: 2, next_tier_position: 3 })],
        window: range(1, 3, legend),
      }),
    })
    const entry = await screen.findByRole('button', { name: /SALÃO DOS LENDÁRIOS/ })
    expect(entry.textContent).toContain('Você está no Salão')
    const info = screen.getByRole('region', { name: 'Sua posição' })
    expect(info.textContent).toContain('Sua posição no Salão')
    expect(info.textContent).toContain('de 3 no Salão')
    expect(plate('Salão').getAttribute('data-tier')).toBe('lendario')
    // Para cima não há mais elo; para baixo, o Diamante.
    expect(screen.getByRole('button', { name: 'Sem elo acima' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Ver elo Diamante' })).not.toBeNull()
  })
})

describe('Ranking · borda esmaecida e elo inteiro', () => {
  it('a borda lê o elo inteiro com tier= e cursor, mantém o titular e "Mostrar só ao seu redor" volta à janela', async () => {
    const ui = userEvent.setup()
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    const { api } = setup({
      [`GET ${OV}`]: diamondOverview(),
      [`GET ${whole('diamante')}`]: rankingPage({ tier_counts: tierCounts({ diamante: 12 }), items: range(1, 4), next_cursor: 'c44' }),
      [`GET ${whole('diamante', 'c44')}`]: rankingPage({ tier_counts: tierCounts({ diamante: 12 }), items: range(5, 12) }),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver 3 times acima' }))
    // 1 a 4 (lidas) + 3 a 9 (janela): contíguo até o 9º; faltam 3 e a página seguinte as traz.
    const more = await screen.findByRole('button', { name: 'Ver mais 3 times' })
    const rows = within(plate()).getAllByRole('listitem')
    expect(rows).toHaveLength(9)
    expect(rows.filter(row => row.getAttribute('aria-current') === 'true')).toHaveLength(1)
    expect(scrolled).toHaveBeenCalledWith({ block: 'center' })
    expect(screen.getByRole('button', { name: 'Mostrar só ao seu redor' })).not.toBeNull()
    await ui.click(more)
    await waitFor(() => expect(within(plate()).getAllByRole('listitem')).toHaveLength(12))
    expect(within(plate()).queryByRole('button', { name: /Ver mais/ })).toBeNull()
    expect(api.calls.map(call => call.path)).toEqual([OV, whole('diamante'), whole('diamante', 'c44')])
    // Volta à janela de ±2 com as bordas.
    await ui.click(screen.getByRole('button', { name: 'Mostrar só ao seu redor' }))
    expect(within(plate()).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Ver 3 times acima' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Ver 4 times abaixo' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostrar só ao seu redor' })).toBeNull()
  })

  it('o titular continua visível mesmo que a primeira página não chegue até ele; a borda do buraco lê a seguinte', async () => {
    const ui = userEvent.setup()
    const mine = (tp: number) => diamond(tp, tp === 45 ? { is_mine: true, team: leoes } : { is_mine: false })
    setup({
      [`GET ${OV}`]: rankingOverview({ tier_counts: tierCounts({ diamante: 60, bronze: 1 }), mine: [myLine({ tier_position: 45, tier_size: 60, rank_position: 46 })], window: range(42, 48, mine) }),
      [`GET ${whole('diamante')}`]: rankingPage({ items: range(1, 20, mine), next_cursor: 'c60' }),
      [`GET ${whole('diamante', 'c60')}`]: rankingPage({ items: range(21, 40, mine), next_cursor: 'c80' }),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver 42 times acima' }))
    // 1 a 20 e 42 a 48: 21 linhas entre elas; a linha do titular segue na tela.
    await ui.click(await screen.findByRole('button', { name: 'Ver mais 21 times' }))
    expect(within(plate()).getAllByRole('listitem').some(row => row.getAttribute('aria-current') === 'true')).toBe(true)
    expect(await screen.findByRole('button', { name: 'Ver mais 1 time' })).not.toBeNull()
  })

  it('um erro ao expandir aparece abaixo da lista com "Tentar de novo" e a janela continua visível', async () => {
    const ui = userEvent.setup()
    let fails = true
    setup({
      [`GET ${OV}`]: diamondOverview(),
      [`GET ${whole('diamante')}`]: () => (fails ? apiError(500, 'Erro ao ler o elo.') : rankingPage({ items: range(1, 12) })),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver 3 times acima' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Erro ao ler o elo.')
    expect(within(plate()).getAllByRole('listitem')).toHaveLength(5)
    fails = false
    await ui.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(within(plate()).getAllByRole('listitem')).toHaveLength(12))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uma falha na página seguinte mantém as linhas lidas e deixa tentar de novo', async () => {
    const ui = userEvent.setup()
    let fails = true
    setup({
      [`GET ${OV}`]: diamondOverview(),
      [`GET ${whole('diamante')}`]: rankingPage({ items: range(1, 4), next_cursor: 'c4' }),
      [`GET ${whole('diamante', 'c4')}`]: () => (fails ? apiError(503, 'Serviço fora do ar.') : rankingPage({ items: range(5, 12) })),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver 3 times acima' }))
    await ui.click(await screen.findByRole('button', { name: 'Ver mais 3 times' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço fora do ar.')
    expect(within(plate()).getAllByRole('listitem')).toHaveLength(9)
    fails = false
    await ui.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(within(plate()).getAllByRole('listitem')).toHaveLength(12))
  })

  it('outro elo mostra os 5 primeiros e a borda de baixo abre o elo inteiro', async () => {
    const ui = userEvent.setup()
    const bronze = (tp: number) => rankingRow(tp, `Bronze ${tp}`, { tier: 'bronze' })
    setup({
      [`GET ${OV}`]: diamondOverview({ tier_counts: tierCounts({ bronze: 8, diamante: 12 }) }),
      [`GET ${top('bronze')}`]: rankingPage({ items: range(1, 6, bronze) }),
      [`GET ${whole('bronze')}`]: rankingPage({ items: range(1, 8, bronze) }),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver elo Bronze' }))
    expect(await screen.findByText('Você está no Diamante. Os 5 primeiros no Bronze:')).not.toBeNull()
    expect(within(plate('Bronze')).getAllByRole('listitem')).toHaveLength(5)
    await ui.click(screen.getByRole('button', { name: 'Ver 3 times abaixo' }))
    await waitFor(() => expect(within(plate('Bronze')).getAllByRole('listitem')).toHaveLength(8))
    expect(screen.getByText('Todos os 8 times no Bronze:')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Mostrar só os 5 primeiros' }))
    expect(within(plate('Bronze')).getAllByRole('listitem')).toHaveLength(5)
  })
})

describe('Ranking · vários times e sem elo', () => {
  const other = { id: 9, name: 'Os Gigantes', initials: 'OG', crest_url: null }
  const second = () => myLine({ team: other, tier: 'ouro', tier_position: 2, tier_size: 2, leader_gap: 3, next_gap: null, next_tier_position: null })

  it('os chips dos times trocam a linha da placa e enviam team_id', async () => {
    const ui = userEvent.setup()
    const { api } = setup({
      [`GET ${OV}`]: diamondOverview({ mine: [myLine(), second()] }),
      [`GET ${OV}&team_id=9`]: rankingOverview({
        selected_team_id: 9, mine: [myLine(), second()], tier_counts: tierCounts({ ouro: 2, diamante: 12 }),
        window: [rankingRow(1, 'Ferrugem FC', { tier_position: 1 }), rankingRow(2, 'Os Gigantes', { tier_position: 2, is_mine: true, team: other })],
      }),
    })
    const group = await screen.findByRole('group', { name: 'Time' })
    expect(within(group).getByRole('button', { name: /Leões do Cerrado/ }).getAttribute('aria-pressed')).toBe('true')
    expect(hero().textContent).toContain('de 12 no Diamante · Leões do Cerrado')
    await ui.click(within(group).getByRole('button', { name: /Os Gigantes/ }))
    await waitFor(() => expect(hero().textContent).toContain('Sua posição no Ouro'))
    expect(hero().textContent).toContain('de 2 no Ouro · Os Gigantes')
    expect(within(screen.getByRole('group', { name: 'Time' })).getByRole('button', { name: /Os Gigantes/ }).getAttribute('aria-pressed')).toBe('true')
    expect(api.calls.map(call => call.path)).toEqual([OV, `${OV}&team_id=9`])
  })

  it('com um só time não há chips', async () => {
    setup({ [`GET ${OV}`]: diamondOverview() })
    await screen.findByRole('region', { name: 'Sua posição' })
    expect(screen.queryByRole('group', { name: 'Time' })).toBeNull()
  })

  it('sem elo, a placa da posição mostra o estado e os chips de faixa leem tier=bronze', async () => {
    const ui = userEvent.setup()
    const bronze = (tp: number) => rankingRow(tp, `Bronze ${tp}`, { tier: 'bronze' })
    const { api } = setup({
      [`GET ${OV}`]: rankingOverview({ tier_counts: tierCounts({ bronze: 4, prata: 3 }), mine: [unrankedLine()], window: null, legend_slots: 0 }),
      [`GET ${top('bronze')}`]: rankingPage({ items: range(1, 4, bronze) }),
      [`GET ${top('prata')}`]: rankingPage({ items: range(1, 3, tp => rankingRow(tp, `Prata ${tp}`, { tier: 'prata' })) }),
    })
    const state = await screen.findByRole('region', { name: 'Sua posição' })
    expect(state.textContent).toContain('Em classificação')
    expect(state.textContent).toContain('2 de 3 partidas')
    expect(state.querySelector('[data-slot="tier-emblem"]')).toBeNull()
    const group = screen.getByRole('group', { name: 'Elo' })
    expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual(['Bronze', 'Prata', 'Ouro', 'Diamante'])
    expect(within(group).getByRole('button', { name: 'Bronze' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByText('Os 4 primeiros no Bronze:')).not.toBeNull()
    expect(within(plate('Bronze')).getAllByRole('listitem')).toHaveLength(4)
    await ui.click(within(group).getByRole('button', { name: 'Prata' }))
    expect(await screen.findByText('Os 3 primeiros no Prata:')).not.toBeNull()
    expect(api.calls.map(call => call.path)).toEqual([OV, top('bronze'), top('prata')])
    // Quem não tem elo não ganha elo: nenhuma frase de "Você está no …".
    expect(screen.queryByText(/Você está no/)).toBeNull()
  })

  it('sem time ativo mostra "Sem time ativo" com o caminho para Meus times; sem marca, o caminho para registrar', async () => {
    const ui = userEvent.setup()
    const { go } = setup({ [`GET ${OV}`]: rankingOverview({ classified_count: 0, tier_counts: tierCounts(), mine: [], window: null, selected_team_id: null, legend_slots: 0 }) })
    const state = await screen.findByRole('region', { name: 'Sua posição' })
    expect(state.textContent).toContain('Sem time ativo')
    await ui.click(within(state).getByRole('button', { name: 'Meus times' }))
    expect(go).toHaveBeenCalledWith('teams')
    expect(screen.getByText('Ninguém classificado ainda')).not.toBeNull()
    cleanup()
    const run = setup({
      'GET /rankings/overview?sport=corrida&distance_km=5': rankingOverview({
        ranking: 'corrida_5', format: null, distance_km: 5, required: 1, classified_count: 0, tier_counts: tierCounts(), legend_slots: 0,
        mine: [unrankedLine({ state: 'sem_marca', team: null, played: 0, required: 1, metric_value: null })], selected_team_id: null, window: null,
      }),
    }, [profile('corrida')])
    const noMark = await screen.findByRole('region', { name: 'Sua posição' })
    expect(noMark.textContent).toContain('Sem marca nos 5 km')
    expect(screen.getByText('Ninguém com marca nos 5 km ainda')).not.toBeNull()
    // Um só "Registrar uma corrida": o do estado, não o do vazio.
    await ui.click(screen.getByRole('button', { name: 'Registrar uma corrida' }))
    expect(run.go).toHaveBeenCalledWith('play')
  })

  it('o ranking vazio é honesto: ninguém classificado e quantas partidas faltam, sem placa nem Salão', async () => {
    setup({ [`GET ${OV}`]: rankingOverview({ classified_count: 0, tier_counts: tierCounts(), mine: [unrankedLine({ played: 0, state: 'sem_jogos' })], window: null, legend_slots: 0 }) })
    expect(await screen.findByText('Ninguém classificado ainda')).not.toBeNull()
    expect(screen.getByText(/O ranking de Society 7×7 · Times começa quando as primeiras partidas forem confirmadas\. São 3 partidas/)).not.toBeNull()
    expect(screen.queryByRole('region', { name: /Ranking no/ })).toBeNull()
    expect(screen.queryByText(/Lendário/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Elo' })).toBeNull()
  })
})

describe('Ranking · folha de categoria', () => {
  const all = [profile('futebol', 'goleiro'), profile('tenis'), profile('corrida')]
  const tennis = '/rankings/overview?sport=tenis'
  const run = (km: number) => `/rankings/overview?sport=corrida&distance_km=${km}`
  const empty = (overrides = {}) => rankingOverview({ classified_count: 0, tier_counts: tierCounts(), mine: [], window: null, selected_team_id: null, legend_slots: 0, ...overrides })

  it('mostra só as modalidades com perfil ativo, na ordem futebol, tênis e corrida', async () => {
    const ui = userEvent.setup()
    setup({ [`GET ${OV}`]: empty() }, [profile('corrida'), profile('tenis'), football])
    await ui.click(await screen.findByRole('button', { name: /Categoria/ }))
    const dialog = screen.getByRole('dialog', { name: 'Categoria do ranking' })
    const group = within(dialog).getByRole('group', { name: 'Modalidade' })
    expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    cleanup()
    setup({ [`GET ${OV}`]: empty() }, [football, profile('corrida')])
    await userEvent.setup().click(await screen.findByRole('button', { name: /Categoria/ }))
    expect(within(within(screen.getByRole('dialog')).getByRole('group', { name: 'Modalidade' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Futebol', 'Corrida'])
  })

  it('com uma só modalidade o bloco some e a folha diz que ela é a única', async () => {
    const ui = userEvent.setup()
    setup({ [`GET ${OV}`]: empty() })
    await ui.click(await screen.findByRole('button', { name: /Categoria/ }))
    const dialog = screen.getByRole('dialog', { name: 'Categoria do ranking' })
    expect(within(dialog).queryByRole('group', { name: 'Modalidade' })).toBeNull()
    expect(within(dialog).getByText('Futebol é a sua única modalidade ativa')).not.toBeNull()
    expect(within(dialog).getByRole('group', { name: 'Formato' })).not.toBeNull()
    // Fecha com "Ver ranking".
    await ui.click(within(dialog).getByRole('button', { name: 'Ver ranking' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sem nenhum perfil, o estado vazio leva a Suas modalidades e nada é pedido à API', async () => {
    const { api, go } = setup({}, [])
    expect(await screen.findByText('Você ainda não joga nenhuma modalidade')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Categoria/ })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Configurar modalidade' }))
    expect(go).toHaveBeenCalledWith('sports')
    expect(api.calls.filter(call => call.path.startsWith('/rankings'))).toHaveLength(0)
  })

  it('troca de formato, de tipo, de posição e de modalidade, sempre pedindo à API a categoria certa', async () => {
    const ui = userEvent.setup()
    const individual = OV.replace('kind=time', 'kind=individual')
    const { api } = setup({
      [`GET ${OV}`]: empty(),
      [`GET ${OV.replace('society', 'futsal')}`]: empty({ format: 'futsal' }),
      [`GET ${individual}&position=goleiro`]: rankingOverview({
        ranking: 'futebol_individual', position: 'goleiro', tier_counts: tierCounts({ ouro: 3 }), legend_slots: 0, selected_team_id: null,
        mine: [myLine({ team: null, tier: 'ouro', tier_position: 2, tier_size: 3, metric_value: 5.66, leader_gap: 0.28, next_gap: 0.4, next_tier_position: 3 })],
        window: [athleteRow(1, 40, 'Bruno Dias', { tier: 'ouro', metric_value: 5.94 }), athleteRow(2, 41, 'Ricardo Moura', { tier: 'ouro', metric_value: 5.66, is_mine: true, tier_position: 2 }), athleteRow(3, 42, 'Caio Ramos', { tier: 'ouro', metric_value: 5.26, tier_position: 3 })],
      }),
      [`GET ${individual}&position=atacante`]: empty({ ranking: 'futebol_individual', position: 'atacante' }),
      [`GET ${tennis}`]: empty({ ranking: 'tenis', format: null }),
      [`GET ${run(5)}`]: empty({ ranking: 'corrida_5', format: null, distance_km: 5 }),
      [`GET ${run(10)}`]: empty({ ranking: 'corrida_10', format: null, distance_km: 10 }),
    }, all)
    const open = () => ui.click(screen.getByRole('button', { name: /Categoria/ }))
    const dialog = () => screen.getByRole('dialog', { name: 'Categoria do ranking' })
    await open()
    await ui.click(within(dialog()).getByRole('button', { name: 'Futsal 5×5' }))
    expect(within(dialog()).getByRole('button', { name: 'Futsal 5×5' }).getAttribute('aria-pressed')).toBe('true')
    await ui.click(within(dialog()).getByRole('button', { name: 'Society 7×7' }))
    // Individual: começa na posição do perfil de futebol (goleiro); a média tem duas casas e as diferenças também.
    await ui.click(within(dialog()).getByRole('button', { name: 'Individual' }))
    expect(within(dialog()).getByRole('button', { name: 'Goleiro' }).getAttribute('aria-pressed')).toBe('true')
    await ui.click(within(dialog()).getByRole('button', { name: 'Ver ranking' }))
    expect(await screen.findByText('Sua posição no Ouro', { exact: false })).not.toBeNull()
    expect(hero().textContent).toContain('5,66')
    expect(hero().textContent).toContain('média')
    expect(hero().textContent).toContain('0,28 atrás do 1º')
    expect(hero().textContent).toContain('0,4 à frente do 3º')
    expect(screen.getByRole('button', { name: /Categoria/ }).textContent).toContain('Futebol · Society 7×7 · Goleiro')
    await open()
    await ui.click(within(dialog()).getByRole('button', { name: 'Atacante' }))
    // Tênis e corrida: sem formato; a distância aparece só na corrida.
    await ui.click(within(dialog()).getByRole('button', { name: 'Tênis' }))
    expect(within(dialog()).queryByRole('group', { name: 'Formato' })).toBeNull()
    expect(within(dialog()).queryByRole('group', { name: 'Distância' })).toBeNull()
    await ui.click(within(dialog()).getByRole('button', { name: 'Corrida' }))
    await ui.click(within(dialog()).getByRole('button', { name: '10 km' }))
    await ui.click(within(dialog()).getByRole('button', { name: 'Ver ranking' }))
    await waitFor(() => expect(api.calls.at(-1)?.path).toBe(run(10)))
    expect(screen.getByRole('button', { name: /Categoria/ }).textContent).toContain('Corrida · 10 km')
    expect(api.calls.map(call => call.path)).toEqual(expect.arrayContaining([
      OV.replace('society', 'futsal'), `${individual}&position=goleiro`, `${individual}&position=atacante`, tennis, run(5), run(10),
    ]))
  })

  it('"Suas marcas" abre o Ranking na corrida e na distância pedidas; sem o perfil, abre na primeira modalidade ativa', async () => {
    const { api } = setup({ [`GET ${run(10)}`]: empty({ ranking: 'corrida_10', format: null, distance_km: 10 }) }, all, { initialSport: 'corrida', initialDistance: 10 })
    await screen.findByText('Ninguém com marca nos 10 km ainda')
    expect(screen.getByRole('button', { name: /Categoria/ }).textContent).toContain('Corrida · 10 km')
    expect(api.calls.map(call => call.path)).toEqual([run(10)])
    cleanup()
    const fallback = setup({ [`GET ${OV}`]: empty() }, [football], { initialSport: 'corrida', initialDistance: 10 })
    await screen.findByText('Ninguém classificado ainda')
    expect(fallback.api.calls.map(call => call.path)).toEqual([OV])
  })

  it('restaura a categoria guardada ao voltar do Salão e avisa cada escolha', async () => {
    const ui = userEvent.setup()
    const saved: RankingState = { sport: 'tenis', kind: 'time', format: 'campo', position: 'defesa', distance: 21, teamId: null }
    const onChange = vi.fn()
    setup({ [`GET ${tennis}`]: empty({ ranking: 'tenis', format: null }), [`GET ${run(21)}`]: empty({ ranking: 'corrida_21', format: null, distance_km: 21 }) }, all, { initial: saved, onChange })
    await screen.findByText('Ninguém classificado ainda')
    expect(screen.getByRole('button', { name: /Categoria/ }).textContent).toContain('Tênis')
    await ui.click(screen.getByRole('button', { name: /Categoria/ }))
    await ui.click(screen.getByRole('button', { name: 'Corrida' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sport: 'corrida', distance: 21 }))
  })
})

describe('Ranking · estados, erros e abertura de perfis', () => {
  it('enquanto os perfis carregam, mostra o carregamento e não pede nada', () => {
    const { api } = setup({}, [], { loading: true })
    expect(screen.getByRole('status').textContent).toBe('Carregando ranking…')
    expect(api.calls).toHaveLength(0)
  })

  it('mostra o carregamento enquanto o resumo chega e marca o painel como ocupado', async () => {
    let release: (value: unknown) => void = () => {}
    setup({ [`GET ${OV}`]: () => new Promise(resolve => { release = resolve }) })
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(document.getElementById('ranking-panel')?.getAttribute('aria-busy')).toBe('true')
    release(diamondOverview())
    await screen.findByRole('region', { name: 'Sua posição' })
    expect(document.getElementById('ranking-panel')?.getAttribute('aria-busy')).toBe('false')
  })

  it('mostra o erro com nova tentativa e chama onExpired quando a sessão cai', async () => {
    let fails = true
    const { onExpired } = setup({ [`GET ${OV}`]: () => (fails ? apiError(500, 'Erro ao montar o ranking.') : diamondOverview()) })
    expect((await screen.findByRole('alert')).textContent).toContain('Erro ao montar o ranking.')
    fails = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('region', { name: 'Sua posição' })).not.toBeNull()
    expect(onExpired).not.toHaveBeenCalled()
    cleanup()
    const expired = setup({ [`GET ${OV}`]: apiError(401, 'Sua sessão expirou. Entre novamente.') })
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })

  it('a falha de conexão ao carregar o ranking fala em conexão e oferece tentar de novo', async () => {
    setup({ [`GET ${OV}`]: apiError(503, 'Serviço fora do ar.') })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Sem conexão com a ARENA')
    expect(within(alert).getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
  })

  it('a falha ao carregar os 5 primeiros de outro elo oferece tentar de novo sem derrubar a tela', async () => {
    const ui = userEvent.setup()
    let fails = true
    setup({
      [`GET ${OV}`]: diamondOverview({ tier_counts: tierCounts({ ouro: 2, diamante: 12 }) }),
      [`GET ${top('ouro')}`]: () => (fails ? apiError(500, 'Erro ao ler o Ouro.') : rankingPage({ items: [rankingRow(1, 'Gigantes')] })),
    })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver elo Ouro' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Erro ao ler o Ouro.')
    expect(screen.getByRole('button', { name: /Categoria/ })).not.toBeNull()
    fails = false
    await ui.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Gigantes')).not.toBeNull()
  })

  it('abre o perfil do atleta ao tocar na linha; times não são links', async () => {
    const ui = userEvent.setup()
    const { onOpenUser } = setup({
      'GET /rankings/overview?sport=tenis': rankingOverview({
        ranking: 'tenis', format: null, tier_counts: tierCounts({ prata: 3 }), legend_slots: 0, selected_team_id: null,
        mine: [myLine({ team: null, tier: 'prata', tier_position: 3, tier_size: 3, leader_gap: 4, next_gap: null, next_tier_position: null })],
        window: [athleteRow(1, 50, 'Ana Souza', { tier: 'prata' }), athleteRow(2, 51, 'Beatriz Lima', { tier: 'prata', tier_position: 2 }), athleteRow(3, 52, 'Ricardo Moura', { tier: 'prata', is_mine: true, tier_position: 3 })],
      }),
    }, [profile('tenis')])
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Abrir perfil de Ana Souza, posição 1' }))
    expect(onOpenUser).toHaveBeenCalledWith(50)
    cleanup()
    setup({ [`GET ${OV}`]: diamondOverview() })
    await screen.findByRole('region', { name: 'Sua posição' })
    expect(screen.queryByRole('button', { name: /Abrir perfil/ })).toBeNull()
  })
})

describe('caminhos, categoria e formatos do Ranking', () => {
  it('monta a consulta na ordem do contrato, com o elo antes do limite, e ignora o que não se aplica', () => {
    expect(rankingPath({ sport: 'futebol', kind: 'individual', format: 'campo', position: 'defesa', limit: 20, cursor: 'Mw' }))
      .toBe('/rankings?sport=futebol&kind=individual&format=campo&position=defesa&limit=20&cursor=Mw')
    expect(rankingPath({ sport: 'futebol', kind: 'time', format: 'society', tier: 'diamante', limit: 6 }))
      .toBe('/rankings?sport=futebol&kind=time&format=society&tier=diamante&limit=6')
    expect(rankingPath({ sport: 'tenis' })).toBe('/rankings?sport=tenis')
    expect(rankingPath({ sport: 'corrida', distance_km: 21, tier: 'lendario' })).toBe('/rankings?sport=corrida&distance_km=21&tier=lendario')
  })

  it('monta o caminho do resumo com o time só quando pedido', async () => {
    expect(rankingOverviewPath({ sport: 'tenis' })).toBe('/rankings/overview?sport=tenis')
    expect(rankingOverviewPath({ sport: 'futebol', kind: 'time', format: 'society' }, 9)).toBe('/rankings/overview?sport=futebol&kind=time&format=society&team_id=9')
    expect(rankingOverviewPath({ sport: 'futebol', kind: 'time', format: 'society' }, null)).toBe('/rankings/overview?sport=futebol&kind=time&format=society')
    const api = mockApi({ [`GET ${OV}`]: diamondOverview(), [`GET ${top('ouro')}`]: rankingPage() })
    expect((await getRankingOverview({ sport: 'futebol', kind: 'time', format: 'society' })).classified_count).toBe(18)
    expect((await getRankings({ sport: 'futebol', kind: 'time', format: 'society', tier: 'ouro', limit: 6 })).classified_count).toBe(3)
    expect(api.calls.map(call => call.path)).toEqual([OV, top('ouro')])
  })

  it('pontos com até uma casa, média por partida com até duas e as diferenças sem sinal', () => {
    expect(formatMetric(38, 'futebol_time')).toBe('38')
    expect(formatMetric(38.55, 'tenis')).toBe('38,6')
    expect(formatMetric(4.256, 'futebol_individual')).toBe('4,26')
    expect(gapText(7, 'futebol_time')).toBe('7 pts')
    expect(gapText(1, 'tenis')).toBe('1 pt')
    expect(gapText(-1.5, 'futebol_time')).toBe('1,5 pts')
    expect(gapText(0.28, 'futebol_individual')).toBe('0,28')
    expect(gapText(42, 'corrida_5')).toBe('0:42')
    expect(gapText(3725, 'corrida_42')).toBe('1:02:05')
    expect(dayMonth('2026-09-03')).toBe('03/09')
  })

  it('traduz a categoria para a API e para o texto', () => {
    const state: RankingState = { sport: 'futebol', kind: 'individual', format: 'campo', position: 'defesa', distance: 10, teamId: null }
    expect(categoryQuery(state)).toEqual({ sport: 'futebol', kind: 'individual', format: 'campo', position: 'defesa' })
    expect(categoryQuery({ ...state, kind: 'time' })).toEqual({ sport: 'futebol', kind: 'time', format: 'campo', position: undefined })
    expect(categoryQuery({ ...state, sport: 'corrida' })).toEqual({ sport: 'corrida', distance_km: 10 })
    expect(categoryQuery({ ...state, sport: 'tenis' })).toEqual({ sport: 'tenis' })
    expect(rankingKey(state)).toBe('futebol_individual')
    expect(rankingKey({ ...state, sport: 'corrida' })).toBe('corrida_10')
    expect(categoryText(state)).toBe('Futebol · Campo 11×11 · Defesa')
    expect(categoryText({ ...state, kind: 'time' })).toBe('Futebol · Campo 11×11 · Times')
    expect(categoryText({ ...state, sport: 'tenis' })).toBe('Tênis')
    expect(categoryDetail({ ...state, sport: 'corrida' })).toBe('10 km')
    expect(subjectNoun({ ...state, kind: 'time' }, 1)).toBe('time')
    expect(subjectNoun({ ...state, kind: 'time' }, 3)).toBe('times')
    expect(subjectNoun(state, 1)).toBe('atleta')
    expect(subjectNoun({ ...state, sport: 'tenis' }, 2)).toBe('atletas')
  })

  it('a janela recolhida tem bordas dos dois lados e a expandida liga as páginas à janela do titular', () => {
    const collapsed = collapsedEntries(range(3, 9), 4, 8, 12)
    const label = (entry: ReturnType<typeof collapsedEntries>[number]) => (entry.type === 'row' ? entry.row.tier_position : `${entry.side}:${entry.count}`)
    expect(collapsed.map(label)).toEqual(['up:3', 4, 5, 6, 7, 8, 'down:4'])
    expect(collapsed[0]).toMatchObject({ type: 'edge', row: { tier_position: 3 } })
    expect(collapsedEntries(range(1, 3), 1, 3, 3).map(entry => entry.type)).toEqual(['row', 'row', 'row'])
    // Sem a linha escondida (ainda não lida), a borda existe e a linha fica vazia.
    expect(collapsedEntries([], 1, 0, 5)).toEqual([{ type: 'edge', side: 'down', count: 5, row: undefined, action: 'expand' }])
    // Expandida: buraco entre as páginas e a janela; sem buraco, a borda de baixo só com mais páginas.
    expect(expandedEntries(range(1, 3), range(10, 12), 30, true).map(label)).toEqual([1, 2, 3, 'down:6', 10, 11, 12])
    expect(expandedEntries(range(1, 12), [], 12, false).every(entry => entry.type === 'row')).toBe(true)
    expect(expandedEntries(range(1, 4), [], 12, true).at(-1)).toMatchObject({ type: 'edge', count: 8, action: 'more' })
    expect(expandedEntries(range(1, 3), range(10, 12), 30, false).some(entry => entry.type === 'edge')).toBe(false)
  })
})

describe('Ranking no aplicativo', () => {
  const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
  const legendsTennis = '/rankings?sport=tenis&tier=lendario&limit=20'
  const tennis = '/rankings/overview?sport=tenis'
  const app = (extra: Record<string, unknown> = {}) => mockApi({
    'GET /me/sports-profiles': [profile('futebol', 'atacante'), profile('tenis')],
    'GET /cities': [brasilia],
    'GET /me/notifications/summary': summaryOf({ unread_count: 3, follow_requests_count: 1 }),
    'GET /me/standings': { calc_version: 1, futebol: { teams: [], individual: [] }, tenis: null, corrida: [] },
    'GET /me/notifications/pending?limit=50': { items: [] },
    'GET /me/notifications?pendente=false': { items: [], next_cursor: null },
    'GET /me/follow-requests': { items: [], next_cursor: null },
    [`GET ${OV}`]: diamondOverview(),
    ...extra,
  })
  const open = async (ui: ReturnType<typeof userEvent.setup>) => {
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: 'Ver elos' }))
    await screen.findByRole('region', { name: /Sua posição/ })
  }

  it('"Ver elos" do Início abre o Ranking na aba acesa, com barra própria: título e sino, sem voltar nem título repetido', async () => {
    Element.prototype.scrollTo = () => {}
    const ui = userEvent.setup()
    const api = app()
    await open(ui)
    const title = screen.getByRole('heading', { level: 1, name: 'Ranking' })
    const header = title.parentElement as HTMLElement
    expect(within(header).queryByRole('button', { name: 'Voltar' })).toBeNull()
    const bell = within(header).getByRole('button', { name: 'Notificações, 4 novas' })
    expect(bell.nextElementSibling).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Ranking' })).toBeNull()
    expect(screen.queryByText(/CADA JOGO CONTA|Reconstrua sua arena/)).toBeNull()
    expect(screen.queryByLabelText('Elos do ranking')).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { current: 'page' }).textContent).toBe('Ranking')
    expect(api.calls.filter(call => call.path.startsWith('/rankings')).map(call => call.path)).toEqual([OV])
    // O sino abre as notificações com o Ranking aceso e volta.
    await ui.click(bell)
    expect(await screen.findByRole('heading', { level: 1, name: 'Notificações' })).not.toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { current: 'page' }).textContent).toBe('Ranking')
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ranking' })).not.toBeNull()
  })

  it('o Salão abre como subtela com voltar e sem sino, lista os Lendários e volta à mesma categoria', async () => {
    Element.prototype.scrollTo = () => {}
    const ui = userEvent.setup()
    const legendRow = (tp: number, overrides: Partial<RankingRow> = {}) => athleteRow(tp, 60 + tp, `Lenda ${tp}`, { tier: 'lendario', tier_position: tp, rank_position: tp, metric_value: 120 - tp, ...overrides })
    const api = app({
      [`GET ${tennis}`]: rankingOverview({
        ranking: 'tenis', format: null, tier_counts: tierCounts({ prata: 4, lendario: 2 }), legend_slots: 2,
        mine: [myLine({ team: null, tier: 'prata', tier_position: 2, tier_size: 4, leader_gap: 3, next_gap: 1, next_tier_position: 3 })], selected_team_id: null,
        window: [athleteRow(1, 50, 'Ana Souza', { tier: 'prata' })], legends_preview: [{ team: null, athlete: person(61, 'Lenda 1') }],
      }),
      [`GET ${legendsTennis}`]: rankingPage({
        ranking: 'tenis', format: null, classified_count: 20, legend_slots: 2, tier_counts: tierCounts({ lendario: 2 }),
        items: [legendRow(1), legendRow(2, { is_mine: true, athlete: person(1, 'Ricardo Moura') })],
      }),
    })
    await open(ui)
    await ui.click(screen.getByRole('button', { name: /Categoria/ }))
    await ui.click(screen.getByRole('button', { name: 'Tênis' }))
    await ui.click(screen.getByRole('button', { name: 'Ver ranking' }))
    await ui.click(await screen.findByRole('button', { name: /SALÃO DOS LENDÁRIOS/ }))
    const title = await screen.findByRole('heading', { level: 1, name: 'Salão dos Lendários' })
    expect(title.textContent).toBe('Salão dos Lendários')
    expect(screen.getByRole('button', { name: 'Voltar' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Notificações/ })).toBeNull()
    expect(screen.getByText('Tênis')).not.toBeNull()
    expect(await screen.findByText('Topo 2 (15% dos classificados) com os pontos de Diamante. 2 de 2 vagas ocupadas.')).not.toBeNull()
    const list = document.querySelector('[data-slot="legends-list"]') as HTMLElement
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining('Lenda 1'), expect.stringContaining('Ricardo Moura')])
    expect(rows[1].getAttribute('aria-current')).toBe('true')
    expect(screen.getByText(/Quem sai do topo 15% ou perde os pontos de Diamante volta ao Diamante no próximo cálculo/)).not.toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { current: 'page' }).textContent).toBe('Ranking')
    // Volta ao Ranking com a categoria escolhida antes de abrir o Salão.
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ranking' })).not.toBeNull()
    await screen.findByRole('button', { name: /SALÃO DOS LENDÁRIOS/ })
    expect(screen.getByRole('button', { name: /Categoria/ }).textContent).toContain('Tênis')
    expect(api.calls.filter(call => call.path === legendsTennis)).toHaveLength(1)
  })
})
