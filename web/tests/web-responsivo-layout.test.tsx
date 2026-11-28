import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { User } from '../src/api/client'
import { LAYOUT_QUERIES, useLayout, useWideLayout } from '../src/hooks/useLayout'
import ArenaPage from '../src/pages/ArenaPage'
import { playBoard, standings } from './matchmaking-fixtures'
import { summaryOf } from './notifications-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/**
 * Janela simulada para `matchMedia`: responde às consultas `(min-width: Nrem)` pela largura atual (1rem = 16 px) e
 * avisa os ouvintes de `change` ao redimensionar. As demais consultas (movimento reduzido, tema) não casam.
 */
function viewport(width: number) {
  let current = width
  const listeners = new Set<() => void>()
  const matches = (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query)
    return min ? current >= Number(min[1]) * 16 : false
  }
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return matches(query) },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }))
  return {
    resize(next: number) {
      current = next
      act(() => { for (const listener of [...listeners]) listener() })
    },
    listeners: () => listeners.size,
  }
}

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', email: 'eu@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const page = (items: unknown[]) => ({ items, next_cursor: null })

beforeEach(() => {
  Element.prototype.scrollTo = () => {} // jsdom não implementa rolagem
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/me/sports-profiles') return [] as never
    if (path === '/me/play') return playBoard() as never
    if (path === '/me/standings') return standings() as never
    if (path === '/me/notifications/summary') return summaryOf({ unread_count: 2, follow_requests_count: 1 }) as never
    if (path === '/users/1') return { id: 1, name: me.name, username: me.username, avatar_url: null, cover_url: null, social_public: false,
      post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self' } as never
    if (method === 'PUT' || method === 'POST') return {} as never
    return page([]) as never
  })
})
afterEach(cleanup)

const renderArena = () => render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
const mainNav = () => screen.getByRole('navigation', { name: 'Navegação principal' })
const sidebar = () => document.querySelector<HTMLElement>('[data-slot="app-sidebar"]')
const notificationButtons = () => screen.queryAllByRole('button', { name: /^Notificações/ })
const menuButtons = () => screen.queryAllByRole('button', { name: 'Menu', exact: true })

describe('useLayout', () => {
  it('responde celular sem matchMedia (jsdom, testes)', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useLayout()).result.current).toBe('celular')
    expect(renderHook(() => useWideLayout()).result.current).toBe(false)
  })

  it.each([
    [320, 'celular'], [430, 'celular'], [767, 'celular'],
    [768, 'tablet'], [1023, 'tablet'],
    [1024, 'computador'], [1920, 'computador'],
  ] as const)('em %i px responde %s', (width, layout) => {
    viewport(width)
    expect(renderHook(() => useLayout()).result.current).toBe(layout)
  })

  it('troca de faixa quando a janela cruza 768 e 1024 px e solta os ouvintes ao desmontar', () => {
    const win = viewport(390)
    const { result, unmount } = renderHook(() => useLayout())
    expect(result.current).toBe('celular')
    win.resize(900)
    expect(result.current).toBe('tablet')
    win.resize(1440)
    expect(result.current).toBe('computador')
    win.resize(600)
    expect(result.current).toBe('celular')
    expect(win.listeners()).toBeGreaterThan(0)
    unmount()
    expect(win.listeners()).toBe(0)
  })

  it('usa as mesmas faixas do CSS (48rem e 64rem)', () => {
    expect(LAYOUT_QUERIES).toEqual({ tablet: '(min-width: 48rem)', computador: '(min-width: 64rem)' })
  })
})

describe('navegação no celular', () => {
  it('sem matchMedia: barra inferior depois do conteúdo, sem lateral nem atalhos extras, com o sino no cabeçalho', async () => {
    renderArena()
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' })
    expect(sidebar()).toBeNull()
    const main = screen.getByRole('main')
    expect(main.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['Início', 'Ranking', 'JOGAR', 'Comunidade', 'Perfil'])
    // O único atalho de notificações é o sino do cabeçalho do Início, dentro do `main`.
    const bell = await within(main).findByRole('button', { name: 'Notificações, 3 novas' })
    expect(notificationButtons()).toEqual([bell])
    expect(menuButtons()).toHaveLength(0)
  })

  it('em 600 px continua o celular (tela cheia, navegação inferior)', async () => {
    viewport(600)
    renderArena()
    await screen.findByRole('navigation', { name: 'Navegação principal' })
    expect(sidebar()).toBeNull()
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Notificações, 3 novas' })).not.toBeNull()
  })
})

describe.each([
  ['tablet', 800],
  ['computador', 1440],
] as const)('navegação lateral no %s', (_layout, width) => {
  it('a lateral vem antes do conteúdo, com os cinco destinos, Notificações (com a contagem) e Menu', async () => {
    viewport(width)
    renderArena()
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' })
    const side = sidebar()!
    expect(side.contains(nav)).toBe(true)
    const main = screen.getByRole('main')
    expect(side.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['Início', 'Ranking', 'JOGAR', 'Comunidade', 'Perfil'])
    expect(within(nav).getByRole('button', { current: 'page' }).textContent).toBe('Início')

    const notifications = await within(side).findByRole('button', { name: 'Notificações, 3 novas' })
    expect(nav.contains(notifications)).toBe(false) // o `nav` principal continua com os cinco destinos
    expect(within(notifications).getByTestId('unread-indicator').textContent).toBe('3')
    expect(within(side).getByRole('button', { name: 'Menu', exact: true })).not.toBeNull()
    // Sem o sino do cabeçalho do Início: o atalho da lateral é o único.
    expect(notificationButtons()).toEqual([notifications])
  })

  it('Notificações e Menu abrem as telas de hoje e ficam ativos no lugar do destino', async () => {
    viewport(width)
    const ui = userEvent.setup()
    renderArena()
    const side = await vi.waitFor(() => sidebar()!)
    const nav = mainNav()
    await ui.click(await within(side).findByRole('button', { name: /^Notificações/ }))
    expect(screen.getByRole('main', { name: 'Notificações' })).not.toBeNull()
    expect(within(side).getByRole('button', { name: /^Notificações/ }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).queryByRole('button', { current: 'page' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('main'))

    // Tocar de novo não empilha outra tela de notificações: o Voltar da placa volta ao Início.
    await ui.click(within(side).getByRole('button', { name: /^Notificações/ }))
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('main', { name: 'Início' })).not.toBeNull()

    await ui.click(within(side).getByRole('button', { name: 'Menu', exact: true }))
    expect(screen.getByRole('main', { name: 'Menu' })).not.toBeNull()
    expect(within(side).getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-current')).toBe('page')
    expect(within(side).getByRole('button', { name: /^Notificações/ }).getAttribute('aria-current')).toBeNull()

    await ui.click(within(nav).getByRole('button', { name: 'Comunidade' }))
    expect(within(nav).getByRole('button', { current: 'page' }).textContent).toBe('Comunidade')
    expect(within(side).getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-current')).toBeNull()
  })

  it.each(['Ranking', 'JOGAR', 'Comunidade', 'Perfil'])('a aba %s não mostra o sino nem o atalho de menu do cabeçalho', async tab => {
    viewport(width)
    const ui = userEvent.setup()
    renderArena()
    await ui.click(within(await screen.findByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: tab }))
    const main = screen.getByRole('main')
    await vi.waitFor(() => expect(main.childElementCount).toBeGreaterThan(0))
    expect(within(main).queryAllByRole('button', { name: /^Notificações/ })).toHaveLength(0)
    expect(within(main).queryAllByRole('button', { name: 'Menu', exact: true })).toHaveLength(0)
    expect(notificationButtons()).toHaveLength(1)
    expect(menuButtons()).toHaveLength(1)
  })
})

describe('troca de faixa com o app aberto', () => {
  it('ao estreitar a janela, a lateral vira a barra inferior e o sino volta ao cabeçalho', async () => {
    const win = viewport(1280)
    renderArena()
    await screen.findByRole('navigation', { name: 'Navegação principal' })
    expect(sidebar()).not.toBeNull()
    win.resize(390)
    expect(sidebar()).toBeNull()
    const nav = mainNav()
    expect(screen.getByRole('main').compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await within(screen.getByRole('main')).findByRole('button', { name: 'Notificações, 3 novas' })).not.toBeNull()
    expect(menuButtons()).toHaveLength(0)
  })
})
