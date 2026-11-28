import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { Post, Profile, SocialUser, User } from '../src/api/client'
import ProfilePage from '../src/pages/ProfilePage'
import UserProfilePage from '../src/pages/UserProfilePage'
import { match, tennisMatch } from './timeline-fixtures'

/*
 * Redimensionar a janela no meio do uso (revisão da web responsiva). Cruzar 768 ou 1024 px não pode remontar o que tem
 * estado do usuário: as abas e o painel do perfil (visualizador de foto aberto, fotos já lidas, filtro de Partidas).
 */

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

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

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', email: 'eu@arena.test', birth_date: '1990-01-01', social_public: true,
  is_admin: false, avatar: null, cover: null }
const meSocial: SocialUser = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', avatar_url: null, cover_url: null, social_public: true,
  post_count: 2, follower_count: 4, following_count: 2, follows_you: false, follow_state: 'self' }
const other: SocialUser = { ...meSocial, id: 2, name: 'Atleta Dois', username: 'atleta.dois', follow_state: 'approved' }
const football: Profile = { id: 1, sport: 'futebol', city_id: 7, city: { id: 7, name: 'Brasília', state: 'DF' }, position: 'atacante',
  looking_for: false, is_public: false, level: null }
const post = (id: number, author: SocialUser): Post => ({ id, author, caption: `Foto ${id}`, image_url: `/posts/${id}/image`,
  created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: true })
const page = (items: unknown[]) => ({ items, next_cursor: null, total: items.length })

describe('Perfil ao redimensionar', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset()
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/users/1') return meSocial as never
      if (path === '/users/2') return other as never
      if (path === '/me/profile-stats') return { played: 4, wins: 2, draws: 1, losses: 1, win_rate: 50, best_tier: null, in_placement: false } as never
      if (path === '/users/1/posts') return page([post(7, meSocial), post(8, meSocial)]) as never
      if (path === '/users/2/posts') return page([post(5, other)]) as never
      if (path === '/users/1/timeline?sport=tenis') return page([tennisMatch()]) as never
      if (path === '/users/1/timeline') return page([match(), tennisMatch()]) as never
      if (path.startsWith('/users/2/mutual-followers')) return { items: [], total: 0, next_cursor: null } as never
      return page([]) as never
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const calls = (path: string) => vi.mocked(request).mock.calls.filter(([called]) => called === path).length
  const renderOwn = () => render(<ProfilePage user={me} profiles={[football]} go={vi.fn()} matches={[]}
    onNewPhoto={vi.fn()} openConnections={vi.fn()} onExpired={vi.fn()} />)

  it('perfil próprio: o visualizador aberto continua aberto e as fotos não são lidas de novo ao cruzar 768 e 1024 px', async () => {
    const win = viewport(390)
    renderOwn()
    const grid = await screen.findByRole('list', { name: 'Fotos de Eu Mesmo' })
    await userEvent.setup().click(within(grid).getByRole('button', { name: /Foto 8/ }))
    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(calls('/users/1/posts')).toBe(1)

    for (const width of [900, 1280, 900, 390]) {
      win.resize(width)
      expect(screen.getByRole('dialog')).not.toBeNull()
    }
    expect(calls('/users/1/posts')).toBe(1)
  })

  it('perfil próprio: o filtro de Partidas sobrevive à troca de faixa, sem nova leitura da linha do tempo', async () => {
    const ui = userEvent.setup()
    const win = viewport(1280)
    renderOwn()
    await ui.click(await screen.findByRole('tab', { name: 'Partidas' }))
    await ui.click(await screen.findByRole('button', { name: 'Filtrar por modalidade' }))
    await ui.click(within(await screen.findByRole('radiogroup', { name: 'Modalidade' })).getByText('Tênis'))
    await waitFor(() => expect(calls('/users/1/timeline?sport=tenis')).toBe(1))
    await screen.findByText('1 registro', { exact: false })

    for (const width of [390, 900, 390, 1280]) {
      win.resize(width)
      expect(document.querySelector('[data-slot="filter-dot"]')).not.toBeNull()
      expect(screen.getByRole('tab', { name: 'Partidas' }).getAttribute('aria-selected')).toBe('true')
    }
    expect(calls('/users/1/timeline?sport=tenis')).toBe(1)
    expect(calls('/users/1/timeline')).toBe(1)
  })

  it('perfil visitado: o visualizador aberto e as fotos lidas sobrevivem ao cruzar 768 px nas duas direções', async () => {
    const win = viewport(1280)
    render(<UserProfilePage userId={2} ownUserId={1} onBack={vi.fn()} onOpenConnections={vi.fn()} onExpired={vi.fn()} />)
    const grid = await screen.findByRole('list', { name: 'Fotos de Atleta Dois' })
    await userEvent.setup().click(within(grid).getByRole('button', { name: /Foto 5/ }))
    expect(screen.getByRole('dialog')).not.toBeNull()

    for (const width of [390, 1280, 900, 390]) {
      win.resize(width)
      expect(screen.getByRole('dialog')).not.toBeNull()
    }
    expect(calls('/users/2/posts')).toBe(1)
  })
})
