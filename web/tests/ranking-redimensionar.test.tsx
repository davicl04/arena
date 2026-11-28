import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '../src/api/client'
import RankingPage from '../src/pages/RankingPage'
import { rankingOverview } from './results-fixtures'
import { mockApi } from './teams-fixtures'

/*
 * Redimensionar a janela com a folha de categoria aberta (revisão da web responsiva). Ao cruzar 1024 px o ranking troca
 * a coluna única pelas duas colunas do computador; a folha aberta tem de continuar a mesma, sem remontar, e, ao fechar,
 * devolver o foco ao botão de categoria da composição nova (o da antiga saiu da tela).
 */

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Janela simulada para `matchMedia` (consultas `(min-width: Nrem)`, 1rem = 16 px) que avisa os ouvintes ao redimensionar. */
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

describe('Ranking ao redimensionar', () => {
  it('a folha de categoria aberta continua a mesma ao cruzar 1024 px nas duas direções', async () => {
    const win = viewport(1440)
    mockApi({ 'GET /rankings/overview?sport=futebol&kind=time&format=society': rankingOverview() })
    render(<RankingPage profiles={[football]} go={vi.fn()} onOpenUser={vi.fn()} onExpired={vi.fn()} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Categoria/ }))
    const sheet = screen.getByRole('dialog', { name: 'Categoria do ranking' })

    win.resize(900)
    expect(screen.getByRole('dialog', { name: 'Categoria do ranking' })).toBe(sheet)
    win.resize(1440)
    expect(screen.getByRole('dialog', { name: 'Categoria do ranking' })).toBe(sheet)
  })

  it.each([
    ['do computador para o tablet', 1440, 900],
    ['do tablet para o computador', 900, 1440],
  ])('%s: fechar a folha com Esc devolve o foco ao botão de categoria que está na tela', async (_label, from, to) => {
    const win = viewport(from)
    mockApi({ 'GET /rankings/overview?sport=futebol&kind=time&format=society': rankingOverview() })
    render(<RankingPage profiles={[football]} go={vi.fn()} onOpenUser={vi.fn()} onExpired={vi.fn()} />)
    const ui = userEvent.setup()
    const opener = await screen.findByRole('button', { name: /Categoria/ })
    await ui.click(opener)
    screen.getByRole('dialog', { name: 'Categoria do ranking' })

    win.resize(to)
    const current = screen.getByRole('button', { name: /Categoria/ })
    expect(current).not.toBe(opener)
    await ui.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Categoria do ranking' })).toBeNull()
    expect(document.activeElement).toBe(current)
  })
})
