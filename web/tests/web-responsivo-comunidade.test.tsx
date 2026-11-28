import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { Post, SocialUser } from '../src/api/client'
import SocialCommunity from '../src/components/SocialCommunity'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/** Janela simulada para `matchMedia` (como em web-responsivo-layout.test.tsx): `(min-width: Nrem)` pela largura atual. */
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

const athlete: SocialUser = { id: 2, name: 'Atleta Dois', username: 'atleta.dois', avatar_url: null, cover_url: null, social_public: true,
  post_count: 1, follower_count: 3, following_count: 2, follows_you: false, follow_state: 'approved' }
const post: Post = { id: 7, author: athlete, caption: 'Treino do dia', image_url: '/post.webp', created_at: '2026-10-10T10:00:00Z',
  like_count: 2, comment_count: 1, liked_by_me: false, can_edit: false }
const page = (items: unknown[]) => ({ items, next_cursor: null })
const calls = (target: string) => vi.mocked(request).mock.calls.filter(([path, method]) => path === target && !method).length

function mockApi(posts: Post[] = [post]) {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === '/posts') return page(posts) as never
    if (path === '/users/1/following') return page([{ user: athlete, state: 'approved' }]) as never
    if (path.startsWith('/users?q=')) return page([athlete]) as never
    return page([]) as never
  })
}
function renderCommunity() {
  const onOpenUser = vi.fn()
  render(<main><SocialCommunity viewerId={1} onOpenUser={onOpenUser} onExpired={vi.fn()} /></main>)
  return { onOpenUser, section: screen.getByRole('region', { name: 'Comunidade Arena' }) }
}

beforeEach(() => {
  Element.prototype.scrollTo = () => {} // jsdom não implementa rolagem
  vi.mocked(request).mockReset()
  mockApi()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Comunidade por faixa', () => {
  it('celular (sem matchMedia): abas Publicações | Atletas, sem coluna lateral nem medida própria', async () => {
    const { section } = renderCommunity()
    expect(await screen.findByRole('article', { name: 'Publicação de @atleta.dois' })).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Comunidade' })).toBeTruthy()
    expect(screen.getByRole('tabpanel')).toBeTruthy()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(section.getAttribute('data-largura')).toBeNull()
    // Alianças só são pedidas ao abrir a aba Atletas.
    expect(calls('/users/1/following')).toBe(0)
  })

  it('tablet: mantém as abas e a busca na barra, com a seção de ponta a ponta', async () => {
    viewport(900)
    const { section } = renderCommunity()
    expect(section.getAttribute('data-largura')).toBe('total')
    expect(await screen.findByRole('article')).toBeTruthy()
    expect(screen.queryByRole('complementary')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: /Atletas/ }))
    expect(screen.getByRole('searchbox', { name: 'Buscar atletas por nome ou @' })).toBeTruthy()
    expect(await screen.findByRole('list', { name: 'Suas alianças' })).toBeTruthy()
  })

  it('computador: feed e coluna Atletas lado a lado, sem abas, com uma requisição de cada lista', async () => {
    viewport(1440)
    const { section, onOpenUser } = renderCommunity()
    expect(section.getAttribute('data-largura')).toBe('total')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tabpanel')).toBeNull()
    const feed = screen.getByRole('region', { name: 'Publicações' })
    expect(await within(feed).findByRole('article')).toBeTruthy()
    const aside = screen.getByRole('complementary', { name: 'Atletas' })
    expect(within(aside).getByRole('searchbox', { name: 'Buscar atletas por nome ou @' })).toBeTruthy()
    expect(await within(aside).findByRole('list', { name: 'Suas alianças' })).toBeTruthy()
    expect(calls('/posts')).toBe(1)
    expect(calls('/users/1/following')).toBe(1)

    await userEvent.type(within(aside).getByRole('searchbox'), 'atleta{Enter}')
    await userEvent.click(await within(aside).findByRole('button', { name: 'Abrir perfil de Atleta Dois' }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
    // O feed continua na tela durante a busca.
    expect(within(feed).getByRole('article')).toBeTruthy()
  })

  it('computador: "Buscar atletas" do feed vazio leva ao campo de busca da coluna', async () => {
    mockApi([])
    viewport(1440)
    renderCommunity()
    await userEvent.click(await screen.findByRole('button', { name: 'Buscar atletas' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Buscar atletas por nome ou @' }))
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('computador: a roda dentro da coluna Atletas não puxa o feed para atualizar; no feed, continua puxando', async () => {
    viewport(1440)
    renderCommunity()
    const feed = screen.getByRole('region', { name: 'Publicações' })
    await within(feed).findByRole('article')
    fireEvent.wheel(screen.getByRole('complementary', { name: 'Atletas' }), { deltaY: -400 })
    expect(screen.queryByText(/para atualizar/)).toBeNull()
    fireEvent.wheel(within(feed).getByRole('article'), { deltaY: -400 })
    expect(screen.getByText(/para atualizar/)).toBeTruthy()
    await waitFor(() => expect(calls('/posts')).toBe(2))
  })

  it('cruzar 1024 px troca abas por colunas sem perder o feed nem repetir a carga', async () => {
    const view = viewport(900)
    renderCommunity()
    expect(await screen.findByRole('article')).toBeTruthy()
    view.resize(1440)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('complementary', { name: 'Atletas' })).toBeTruthy()
    expect(screen.getByRole('article')).toBeTruthy()
    view.resize(900)
    expect(screen.getByRole('tablist', { name: 'Comunidade' })).toBeTruthy()
    expect(calls('/posts')).toBe(1)
  })
})
