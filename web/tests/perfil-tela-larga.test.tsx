import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { Post, Profile, SocialUser, User } from '../src/api/client'
import ProfilePage from '../src/pages/ProfilePage'
import UserProfilePage from '../src/pages/UserProfilePage'

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

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', email: 'eu@arena.test', birth_date: '1990-01-01', social_public: true,
  is_admin: false, avatar: null, cover: null }
const meSocial: SocialUser = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', avatar_url: null, cover_url: null, social_public: true,
  post_count: 3, follower_count: 4, following_count: 2, follows_you: false, follow_state: 'self' }
const other: SocialUser = { ...meSocial, id: 2, name: 'Atleta Dois', username: 'atleta.dois', follow_state: 'approved' }
const football: Profile = { id: 1, sport: 'futebol', city_id: 7, city: { id: 7, name: 'Brasília', state: 'DF' }, position: 'atacante',
  looking_for: false, is_public: false, level: null }
const post = (id: number, author: SocialUser): Post => ({ id, author, caption: `Foto ${id}`, image_url: `/posts/${id}/image`,
  created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: true })

let failVisited = false
beforeEach(() => {
  failVisited = false
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/users/1') return meSocial as never
    if (path === '/users/2') {
      if (failVisited) throw new Error('Falha de teste')
      return other as never
    }
    if (path === '/me/profile-stats') return { played: 4, wins: 2, draws: 1, losses: 1, win_rate: 50, best_tier: null, in_placement: false } as never
    if (path === '/users/1/posts') return { items: [post(7, meSocial), post(8, meSocial), post(9, meSocial)], next_cursor: null } as never
    if (path === '/users/2/posts') return { items: [post(5, other)], next_cursor: null } as never
    if (path.startsWith('/users/2/mutual-followers')) return { items: [], total: 0, next_cursor: null } as never
    return { items: [], next_cursor: null } as never
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderOwn(go = vi.fn()) {
  const { container } = render(<ProfilePage user={me} profiles={[football]} go={go} matches={[]} notificationCount={2}
    onNewPhoto={vi.fn()} openConnections={vi.fn()} onExpired={vi.fn()} />)
  return { container, go }
}
const gallery = () => screen.findByRole('list', { name: 'Fotos de Eu Mesmo' })

describe('Perfil próprio em tela larga', () => {
  it('no celular, fica como hoje: sem medida própria, selo de edição no avatar e grade de 3 sem quadros extras', async () => {
    const { container } = renderOwn()
    const grid = await gallery()
    expect(container.querySelector('[data-largura]')).toBeNull()
    expect(container.querySelector('[data-slot="perfil-faixa"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Notificações/ })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Menu' })).not.toBeNull()
    const edit = screen.getByRole('button', { name: 'Editar perfil' })
    expect(edit.textContent).toBe('')
    expect(within(grid).getAllByRole('listitem')).toHaveLength(3)
    expect(within(grid).queryByRole('button', { name: /Nova foto/ })).toBeNull()
  })

  it('no computador, usa a medida larga, põe modalidades e estatísticas numa faixa e troca o selo pelo botão Editar perfil', async () => {
    viewport(1280)
    const { container, go } = renderOwn()
    const grid = await gallery()
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-largura')).toBe('larga')
    expect(screen.queryByRole('button', { name: /Notificações/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull()
    const band = root.querySelector('[data-slot="perfil-faixa"]') as HTMLElement
    expect(within(band).getByRole('button', { name: /Minhas modalidades/ })).not.toBeNull()
    expect(within(band).getByRole('heading', { name: 'Suas estatísticas' })).not.toBeNull()
    expect(within(band).getByText('50%')).not.toBeNull()
    const edit = screen.getByRole('button', { name: 'Editar perfil' })
    expect(edit.textContent).toBe('Editar perfil')
    await userEvent.setup().click(edit)
    expect(go).toHaveBeenCalledWith('edit-profile')
    // Grade de 5 colunas: 3 fotos, "Nova foto" e um quadro vazio completam a linha.
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4)
    expect(within(grid).getByRole('button', { name: /Nova foto/ })).not.toBeNull()
    expect(grid.querySelectorAll(':scope > span[aria-hidden="true"]')).toHaveLength(1)
  })

  it('no tablet, a grade tem 4 colunas e a linha se completa só com "Nova foto"; volta ao celular ao estreitar', async () => {
    const screenSize = viewport(900)
    const { container } = renderOwn()
    const grid = await gallery()
    expect(container.firstElementChild?.getAttribute('data-largura')).toBe('larga')
    expect(within(grid).getByRole('button', { name: /Nova foto/ })).not.toBeNull()
    expect(grid.querySelectorAll(':scope > span[aria-hidden="true"]')).toHaveLength(0)
    screenSize.resize(390)
    expect(container.querySelector('[data-largura]')).toBeNull()
    expect(within(await gallery()).queryByRole('button', { name: /Nova foto/ })).toBeNull()
  })
})

describe('Perfil visitado em tela larga', () => {
  const renderVisited = () => render(<UserProfilePage userId={2} ownUserId={1} onBack={vi.fn()} onOpenConnections={vi.fn()} onExpired={vi.fn()} />).container

  it('no celular, fica sem medida própria', async () => {
    const container = renderVisited()
    expect(await screen.findByRole('heading', { name: '@atleta.dois' })).not.toBeNull()
    expect(container.querySelector('[data-largura]')).toBeNull()
  })

  it('no computador, usa a medida larga com o perfil carregado e também no erro de carregamento', async () => {
    viewport(1280)
    const container = renderVisited()
    expect(await screen.findByRole('heading', { name: '@atleta.dois' })).not.toBeNull()
    expect(container.firstElementChild?.getAttribute('data-largura')).toBe('larga')
    expect(screen.getByRole('button', { name: 'Desfazer aliança' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Voltar' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Ações da conta' })).not.toBeNull()
    cleanup()
    failVisited = true
    const failed = renderVisited()
    expect(await screen.findByText('Não foi possível carregar este perfil')).not.toBeNull()
    expect(failed.firstElementChild?.getAttribute('data-largura')).toBe('larga')
  })
})
