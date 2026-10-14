import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RankingRow } from '../src/api/results'
import type { RankingState } from '../src/components/ranking/category'
import { RecentForm } from '../src/components/ranking/RecentForm'
import { tierOrder, tierTints } from '../src/data/arena'
import LegendsPage from '../src/pages/LegendsPage'
import { athleteRow, rankingPage, rankingRow, tierCounts } from './results-fixtures'
import { apiError, mockApi } from './teams-fixtures'

afterEach(cleanup)

const football: RankingState = { sport: 'futebol', kind: 'time', format: 'society', position: 'atacante', distance: 5, teamId: null }
const path = (extra = '') => `/rankings?sport=futebol&kind=time&format=society&tier=lendario&limit=20${extra}`
const legend = (tp: number, overrides: Partial<RankingRow> = {}) =>
  rankingRow(tp, `Lenda ${tp}`, { tier: 'lendario', tier_position: tp, rank_position: tp, metric_value: 130 - tp, ...overrides })

function setup(routes: Parameters<typeof mockApi>[0], state: RankingState = football) {
  const api = mockApi(routes)
  const onBack = vi.fn()
  const onOpenUser = vi.fn()
  const onExpired = vi.fn()
  render(<LegendsPage ranking={state} onBack={onBack} onOpenUser={onOpenUser} onExpired={onExpired} />)
  return { api, onBack, onOpenUser, onExpired }
}

describe('Salão dos Lendários', () => {
  it('mostra o título, a categoria, a regra com as vagas ocupadas e a lista numerada, com a minha linha em destaque', async () => {
    const { api, onBack } = setup({
      [`GET ${path()}`]: rankingPage({ classified_count: 80, legend_slots: 12, tier_counts: tierCounts({ lendario: 12 }), items: [legend(1), legend(2, { is_mine: true, form: ['V', 'E'] })] }),
    })
    expect(screen.getByRole('status').textContent).toBe('Carregando ranking…')
    expect(await screen.findByText('Topo 12 (15% dos classificados) com os pontos de Diamante. 12 de 12 vagas ocupadas.')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Salão dos Lendários' })).not.toBeNull()
    expect(screen.getByText('Futebol · Society 7×7 · Times')).not.toBeNull()
    const rows = within(document.querySelector('[data-slot="legends-list"]') as HTMLElement).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1].getAttribute('aria-current')).toBe('true')
    expect(within(rows[1]).getByText('Seu time')).not.toBeNull()
    expect(within(rows[1]).getByRole('img', { name: 'Últimos resultados: vitória, empate' })).not.toBeNull()
    expect(screen.getByText(/volta ao Diamante no próximo cálculo/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Notificações/ })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalled()
    expect(api.calls.map(call => call.path)).toEqual([path()])
  })

  it('diz "1 vaga ocupada" no singular e explica a regra sem vagas', async () => {
    setup({ [`GET ${path()}`]: rankingPage({ legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: [legend(1)] }) })
    expect(await screen.findByText('Topo 1 (15% dos classificados) com os pontos de Diamante. 1 de 1 vaga ocupada.')).not.toBeNull()
    cleanup()
    setup({ [`GET ${path()}`]: rankingPage({ legend_slots: 0, tier_counts: tierCounts(), items: [] }) })
    expect(await screen.findByText(/As vagas abrem com 7 classificados/)).not.toBeNull()
    expect(screen.getByText('Nenhum Lendário ainda nesta categoria.')).not.toBeNull()
  })

  it('pagina com cursor e abre o perfil do atleta; o tênis e a corrida usam a própria categoria', async () => {
    const ui = userEvent.setup()
    const tennis: RankingState = { ...football, sport: 'tenis' }
    const { onOpenUser, api } = setup({
      'GET /rankings?sport=tenis&tier=lendario&limit=20': rankingPage({ ranking: 'tenis', format: null, legend_slots: 3, tier_counts: tierCounts({ lendario: 3 }), items: [athleteRow(1, 50, 'Ana Souza', { tier: 'lendario' }), athleteRow(2, 51, 'Beatriz Lima', { tier: 'lendario', tier_position: 2 })], next_cursor: 'c2' }),
      'GET /rankings?sport=tenis&tier=lendario&limit=20&cursor=c2': rankingPage({ ranking: 'tenis', format: null, legend_slots: 3, tier_counts: tierCounts({ lendario: 3 }), items: [athleteRow(3, 52, 'Carla Nunes', { tier: 'lendario', tier_position: 3 })] }),
    }, tennis)
    await ui.click(await screen.findByRole('button', { name: 'Abrir perfil de Ana Souza, posição 1' }))
    expect(onOpenUser).toHaveBeenCalledWith(50)
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Carla Nunes')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
    expect(api.calls).toHaveLength(2)
    cleanup()
    const run = setup({
      'GET /rankings?sport=corrida&distance_km=10&tier=lendario&limit=20': rankingPage({ ranking: 'corrida_10', format: null, distance_km: 10, legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: [athleteRow(1, 60, 'Dora Lima', { tier: 'lendario', metric_value: 2400, form: null, best_mark_on: '2026-08-15' })] }),
    }, { ...football, sport: 'corrida', distance: 10 })
    expect(await screen.findByText('Dora Lima')).not.toBeNull()
    expect(screen.getByText('Corrida · 10 km')).not.toBeNull()
    expect(screen.getByText('40:00')).not.toBeNull()
    expect(screen.getByText('melhor marca em 15/08')).not.toBeNull()
    expect(run.api.calls).toHaveLength(1)
  })

  it('uma falha ao carregar mais mantém a lista e avisa; o erro de carga oferece tentar de novo; 401 chama onExpired', async () => {
    const ui = userEvent.setup()
    let fails = true
    setup({
      [`GET ${path()}`]: rankingPage({ legend_slots: 2, tier_counts: tierCounts({ lendario: 2 }), items: [legend(1)], next_cursor: 'c1' }),
      [`GET ${path('&cursor=c1')}`]: () => (fails ? apiError(503, 'Serviço fora do ar.') : rankingPage({ items: [legend(2)] })),
    })
    await screen.findByText('Lenda 1')
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço fora do ar.')
    expect(screen.getByText('Lenda 1')).not.toBeNull()
    fails = false
    await ui.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Lenda 2')).not.toBeNull()
    cleanup()
    let broken = true
    setup({ [`GET ${path()}`]: () => (broken ? apiError(500, 'Erro ao ler o Salão.') : rankingPage({ legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: [legend(1)] })) })
    expect((await screen.findByRole('alert')).textContent).toContain('Erro ao ler o Salão.')
    broken = false
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Lenda 1')).not.toBeNull()
    cleanup()
    const expired = setup({ [`GET ${path()}`]: apiError(401, 'Sua sessão expirou. Entre novamente.') })
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })

  it('um atleta sem foto aparece com as iniciais', async () => {
    setup({ [`GET ${path()}`]: rankingPage({ legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: [athleteRow(1, 70, 'Eva Mendes', { tier: 'lendario' })] }) })
    await screen.findByText('Eva Mendes')
    expect(screen.getByLabelText('Eva Mendes').textContent).toBe('EM')
  })
})

describe('forma recente e tons dos elos', () => {
  it('mostra no máximo as 5 últimas, sem nada quando não há partidas', () => {
    const { container, rerender } = render(<RecentForm form={['D', 'D', 'V', 'E', 'D', 'V', 'V']} />)
    expect(container.textContent).toBe('VEDVV')
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Últimos resultados: vitória, empate, derrota, vitória, vitória')
    rerender(<RecentForm form={[]} />)
    expect(container.textContent).toBe('')
  })

  it('a ordem dos elos vai do Bronze ao Lendário e cada elo tem o seu tom', () => {
    expect(tierOrder).toEqual(['bronze', 'prata', 'ouro', 'diamante', 'lendario'])
    expect(Object.keys(tierTints)).toEqual([...tierOrder])
    expect(tierTints.ouro).toBe('var(--color-tier-ouro-tint)')
  })
})
