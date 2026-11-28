import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { request } from '../src/api/client'
import type { City, Profile } from '../src/api/client'
import type { PlayBoardState } from '../src/hooks/usePlayBoard'
import PlayPage from '../src/pages/PlayPage'
import { standings } from './matchmaking-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/* Janela simulada para `matchMedia` (como em web-responsivo-layout.test.tsx): casa `(min-width: Nrem)` pela largura atual. */
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

const city: City = { id: 7, name: 'Brasília', state: 'DF' }
const football: Profile = { id: 1, sport: 'futebol', city_id: 7, city, position: 'atacante', looking_for: false, is_public: false, level: null }
const board: PlayBoardState = {
  board: { attention: false, searches: [], proposals: [], offers: [], matches: [] },
  loading: false, error: '', reload: vi.fn(async () => null), deferred: [], defer: vi.fn(),
}

function renderPlay() {
  const { container } = render(<PlayPage profiles={[football]} loading={false} board={board} notificationCount={3} go={vi.fn()} onExpired={vi.fn()} />)
  return container.firstElementChild as HTMLElement
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/me/standings') return standings() as never
    return { items: [], next_cursor: null } as never
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Jogar em tela larga', () => {
  it('no celular, fica como hoje: sem medida própria e com o sino no cabeçalho da placa', () => {
    const root = renderPlay()
    expect(root.hasAttribute('data-largura')).toBe(false)
    expect(screen.getByRole('button', { name: /Notificações/ })).not.toBeNull()
  })

  it('no tablet, continua na coluna de leitura e o sino sai da placa (está na lateral)', () => {
    viewport(900)
    const root = renderPlay()
    expect(root.hasAttribute('data-largura')).toBe(false)
    expect(screen.queryByRole('button', { name: /Notificações/ })).toBeNull()
  })

  it('no computador, usa a medida larga e mantém a ordem: placa, Minhas partidas e Outras formas de jogar', () => {
    viewport(1280)
    const root = renderPlay()
    expect(root.getAttribute('data-largura')).toBe('larga')
    const sections = [...root.children].filter(child => child.tagName === 'SECTION')
    expect(sections.map(section => section.querySelector('h1, h2')?.textContent)).toEqual(['Jogar', 'Minhas partidas', 'Outras formas de jogar'])
  })

  it('ao cruzar 1024 px, troca só a medida: os blocos são os mesmos elementos (nada remonta)', () => {
    const view = viewport(1280)
    const root = renderPlay()
    const matches = screen.getByRole('heading', { name: 'Minhas partidas' }).closest('section')
    view.resize(900)
    expect(root.hasAttribute('data-largura')).toBe(false)
    expect(screen.getByRole('heading', { name: 'Minhas partidas' }).closest('section')).toBe(matches)
    view.resize(1280)
    expect(root.getAttribute('data-largura')).toBe('larga')
    expect(screen.getByRole('heading', { name: 'Minhas partidas' }).closest('section')).toBe(matches)
  })
})
