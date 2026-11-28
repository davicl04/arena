import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { Profile } from '../src/api/client'
import { SportsProfiles } from '../src/components/sports-profile/SportsProfiles'
import { TeamCardCarousel } from '../src/components/teams/TeamCardCarousel'
import MenuPage from '../src/pages/MenuPage'
import { goiania, team } from './teams-fixtures'

/*
 * Subtelas de conta, social e times em tela larga (ticket 08 da web responsiva): o Menu em duas colunas e Minhas
 * modalidades na medida larga só no computador; no celular e no tablet, a estrutura de hoje. As carteirinhas de Meus
 * times viram grade em tablet e computador (CSS) e continuam escolhidas por clique e pelas setas.
 */

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/*
 * Janela simulada para `matchMedia` (como em web-responsivo-layout.test.tsx): casa `(min-width: Nrem)` pela largura atual.
 * Só as consultas de largura são avisadas ao redimensionar (o cartão de aparência do Menu também ouve o tema do sistema).
 */
function viewport(width: number) {
  let current = width
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query)
    return {
      get matches() { return min ? current >= Number(min[1]) * 16 : false },
      media: query,
      addEventListener: (_type: string, listener: () => void) => { if (min) listeners.add(listener) },
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }
  })
  return {
    resize(next: number) {
      current = next
      act(() => { for (const listener of [...listeners]) listener() })
    },
  }
}

const noop = () => {}
function renderMenu(isAdmin = false) {
  const { container } = render(<MenuPage isAdmin={isAdmin} busy={false} onEditProfile={noop} onSports={noop} onModeration={noop}
    onOrganizerRequest={noop} onOrganizerRequests={noop} onPaidEvents={noop} onRevokedEvents={noop} onRefundDisputes={noop}
    onCourtSuggestions={noop} onWalkoverDisputes={noop} onOrganizerEvents={noop} onOpenEvent={noop} onNewEvent={noop}
    onNotifications={noop} onLogout={noop} onExpired={noop} />)
  return container
}
const headings = (root: HTMLElement) => within(root).getAllByRole('heading', { level: 2 }).map(item => item.textContent)

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/me/organizer-request') return { state: 'nenhum', request: null, organizer: null, revocation: null } as never
    if (path === '/admin/queue-counts') return { organizer_requests: 2 } as never
    return { items: [], next_cursor: null } as never
  })
  Element.prototype.scrollTo = () => {}
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Menu em tela larga', () => {
  it('no celular e no tablet, coluna única como hoje; no computador, duas colunas na medida larga, na mesma ordem', () => {
    const screenSize = viewport(390)
    const container = renderMenu(true)
    const order = headings(container)
    expect(order).toEqual(['Conta', 'Administração', 'Aparência', 'App'])
    expect(container.querySelector('[data-slot="menu-colunas"]')).toBeNull()
    expect(container.querySelector('[data-largura]')).toBeNull()

    screenSize.resize(800)
    expect(container.querySelector('[data-slot="menu-colunas"]')).toBeNull()

    screenSize.resize(1440)
    const columns = container.querySelector<HTMLElement>('[data-slot="menu-colunas"]')
    expect(columns?.dataset.largura).toBe('larga')
    expect(columns?.parentElement).toBe(container)
    const [account, app] = Array.from(columns!.children) as HTMLElement[]
    expect(headings(account)).toEqual(['Conta', 'Administração'])
    expect(headings(app)).toEqual(['Aparência', 'App'])
    expect(within(app).getByRole('button', { name: 'Sair da conta' })).toBeTruthy()
    expect(headings(container)).toEqual(order)
  })
})

describe('Minhas modalidades em tela larga', () => {
  const profiles: Profile[] = [{ id: 7, sport: 'futebol', city_id: goiania.id, city: goiania, position: null, looking_for: false, is_public: false, level: null }]

  it('só no computador a grade das faixas pede a medida larga', () => {
    const screenSize = viewport(800)
    const { container } = render(<SportsProfiles profiles={profiles} loading={false} onSave={vi.fn()} onExpired={noop} />)
    expect(container.querySelector('[data-largura]')).toBeNull()

    screenSize.resize(1280)
    const grid = container.querySelector<HTMLElement>('[data-largura="larga"]')
    expect(grid?.parentElement).toBe(container)
    expect(within(grid!).getAllByRole('button')).toHaveLength(3)
  })
})

describe('Carteirinhas de Meus times em tela larga', () => {
  it('na grade, clicar numa carteirinha a escolhe e as setas seguem trocando de time', async () => {
    viewport(1440)
    const onSelect = vi.fn()
    const teams = [team(), team({ id: 11, name: 'Cerrado FC', initials: 'CF' })]
    render(<TeamCardCarousel teams={teams} selectedId={10} onSelect={onSelect} onCreate={noop} onInvite={noop} onLink={noop} onEdit={noop} onLeave={noop} />)
    const ui = userEvent.setup()

    await ui.click(screen.getByRole('group', { name: 'Cerrado FC, 2 de 2' }))
    expect(onSelect).toHaveBeenLastCalledWith(11)

    screen.getByRole('group', { name: 'Ferrugem FC, 1 de 2' }).focus()
    onSelect.mockClear()
    await ui.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenLastCalledWith(11)
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Cerrado FC, 2 de 2' }))
  })
})
