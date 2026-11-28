import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '../src/api/client'
import type { RankingRow } from '../src/api/results'
import RankingPage from '../src/pages/RankingPage'
import { leoes, rankingOverview, rankingPage, rankingRow, tierCounts, unrankedLine } from './results-fixtures'
import { mockApi } from './teams-fixtures'

/*
 * Ranking em tela larga (ticket 04 da web responsiva): no computador, os mesmos blocos em duas colunas, com a placa
 * contínua dividida (sua posição à esquerda; troca de elo e lista à direita); no celular e no tablet, a coluna única de
 * hoje. A estrutura muda por faixa pelo gancho `useLayout`, simulado aqui com `matchMedia`.
 */

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Janela simulada: responde às consultas `(min-width: Nrem)` pela largura atual e avisa os ouvintes ao redimensionar. */
function viewport(width: number) {
  let current = width
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      const min = /min-width:\s*([\d.]+)rem/.exec(query)
      return min ? current >= Number(min[1]) * 16 : false
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }))
  return {
    resize(next: number) {
      current = next
      act(() => { for (const listener of [...listeners]) listener() })
    },
  }
}

const football: Profile = { id: 1, sport: 'futebol', city_id: 5300108, city: { id: 5300108, name: 'Brasília', state: 'DF' }, position: 'goleiro', looking_for: false, is_public: false, level: null }
const OV = '/rankings/overview?sport=futebol&kind=time&format=society'
const top = (tier: string) => `/rankings?sport=futebol&kind=time&format=society&tier=${tier}&limit=6`
const diamond = (tp: number): RankingRow =>
  rankingRow(tp, tp === 6 ? 'Leões do Cerrado' : `Time ${tp}`, { tier: 'diamante', rank_position: tp + 40, metric_value: 1105 - tp * 3, ...(tp === 6 ? { is_mine: true, team: leoes } : {}) })
const overview = () => rankingOverview({
  window: [3, 4, 5, 6, 7, 8, 9].map(diamond),
  tier_counts: tierCounts({ ouro: 2, diamante: 12, lendario: 1 }),
  legends_preview: [{ team: { id: 1, name: 'Ferrugem FC', initials: 'FF', crest_url: null }, athlete: null }],
})
const ouro = rankingPage({ tier_counts: tierCounts({ ouro: 2 }), items: [rankingRow(1, 'Gigantes', { tier_position: 1 }), rankingRow(2, 'Ferrugem FC', { tier_position: 2 })] })

function setup(routes: Parameters<typeof mockApi>[0]) {
  const api = mockApi(routes)
  render(<RankingPage profiles={[football]} go={vi.fn()} onOpenUser={vi.fn()} onExpired={vi.fn()} />)
  return { api }
}
const panel = () => document.getElementById('ranking-panel') as HTMLElement
const aside = () => panel().querySelector<HTMLElement>('[data-slot="ranking-aside"]')
const plate = (tier: string) => screen.getByRole('region', { name: `Ranking no ${tier}` })

describe('Ranking · tela larga', () => {
  it('no computador, a categoria, o Salão e a sua posição ficam à esquerda; a troca de elo e a lista, à direita', async () => {
    viewport(1440)
    setup({ [`GET ${OV}`]: overview() })
    const position = await screen.findByRole('region', { name: 'Sua posição' })
    expect(panel().getAttribute('data-largura')).toBe('larga')
    const left = aside() as HTMLElement
    expect(within(left).getByRole('button', { name: /Categoria/ })).not.toBeNull()
    expect(within(left).getByRole('button', { name: /SALÃO DOS LENDÁRIOS/ })).not.toBeNull()
    expect(left.contains(position)).toBe(true)
    expect(position.closest('[data-slot="tier-head"]')?.getAttribute('data-tier')).toBe('diamante')
    // A placa da lista é a região do ranking: a troca de elo e a janela ao redor do titular, sem a sua posição.
    const list = plate('Diamante')
    expect(left.contains(list)).toBe(false)
    expect(list.contains(position)).toBe(false)
    expect(within(list).getByRole('button', { name: 'Ver elo Ouro' })).not.toBeNull()
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[2].getAttribute('aria-current')).toBe('true')
  })

  it('no computador, outro elo tira a sua posição e põe a nota acima da lista; a escolha sobrevive à troca de faixa', async () => {
    const ui = userEvent.setup()
    const win = viewport(1440)
    setup({ [`GET ${OV}`]: overview(), [`GET ${top('ouro')}`]: ouro })
    await screen.findByRole('region', { name: 'Sua posição' })
    await ui.click(screen.getByRole('button', { name: 'Ver elo Ouro' }))
    const note = await screen.findByText('Você está no Diamante. Os 2 primeiros no Ouro:')
    expect(plate('Ouro').contains(note)).toBe(true)
    expect(screen.queryByRole('region', { name: 'Sua posição' })).toBeNull()
    expect(panel().querySelector('[data-slot="tier-head"]')).toBeNull()
    // Celular: a mesma escolha, agora na coluna única (sem a coluna da esquerda e sem a medida larga).
    win.resize(390)
    expect(aside()).toBeNull()
    expect(panel().hasAttribute('data-largura')).toBe(false)
    expect(plate('Ouro').contains(screen.getByText('Você está no Diamante. Os 2 primeiros no Ouro:'))).toBe(true)
    expect(within(plate('Ouro')).getAllByRole('listitem').map(row => row.textContent)).toEqual([expect.stringContaining('Gigantes'), expect.stringContaining('Ferrugem FC')])
  })

  it('no computador, sem elo, o estado da posição e os chips de faixa ficam à esquerda e a nota vai com a lista', async () => {
    viewport(1280)
    setup({
      [`GET ${OV}`]: rankingOverview({ tier_counts: tierCounts({ bronze: 2 }), mine: [unrankedLine()], window: null, legend_slots: 0 }),
      [`GET ${top('bronze')}`]: rankingPage({ items: [1, 2].map(tp => rankingRow(tp, `Bronze ${tp}`, { tier: 'bronze' })) }),
    })
    const state = await screen.findByRole('region', { name: 'Sua posição' })
    const left = aside() as HTMLElement
    expect(left.contains(state)).toBe(true)
    expect(within(left).getByRole('group', { name: 'Elo' })).not.toBeNull()
    expect(left.querySelector('[data-slot="tier-head"]')).toBeNull()
    expect(plate('Bronze').contains(await screen.findByText('Os 2 primeiros no Bronze:'))).toBe(true)
  })

  it('no tablet, a coluna única de hoje: a sua posição continua dentro da placa contínua', async () => {
    viewport(900)
    setup({ [`GET ${OV}`]: overview() })
    const position = await screen.findByRole('region', { name: 'Sua posição' })
    expect(aside()).toBeNull()
    expect(panel().hasAttribute('data-largura')).toBe(false)
    expect(plate('Diamante').contains(position)).toBe(true)
  })
})
