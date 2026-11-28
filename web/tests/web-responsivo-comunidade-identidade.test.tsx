import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { Post, SocialComment, SocialUser } from '../src/api/client'
import SocialCommunity from '../src/components/SocialCommunity'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/** Janela simulada para `matchMedia` (como em web-responsivo-comunidade.test.tsx): `(min-width: Nrem)` pela largura atual. */
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
const comment: SocialComment = { id: 30, author_id: 2, author_name: 'Atleta Dois', author_avatar_url: null,
  body: 'Bom treino!', created_at: '2026-10-10T11:00:00Z', can_delete: false }
const page = (items: unknown[]) => ({ items, next_cursor: null })
/** Lista de resultados da busca de atletas (`PersonList`, um `div` rotulado). */
const results = () => document.querySelector<HTMLElement>('[aria-label="Resultados da busca"]')
const calls = (target: string) => vi.mocked(request).mock.calls.filter(([path, method]) => path === target && !method).length

beforeEach(() => {
  Element.prototype.scrollTo = () => {} // jsdom não implementa rolagem
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === '/posts') return page([post]) as never
    if (path === '/posts/7/comments') return page([comment]) as never
    if (path === '/users/1/following') return page([{ user: athlete, state: 'approved' }]) as never
    if (path.startsWith('/users?q=')) return page([athlete]) as never
    return page([]) as never
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/*
 * Cruzar 1024 px troca as abas pelas duas colunas. O feed e a lista de atletas têm de continuar no mesmo lugar da árvore
 * React: se remontarem, o vidro de comentários fecha, o rascunho some e as listas são pedidas de novo.
 */
describe('Comunidade: redimensionar cruzando 1024 px preserva o que está aberto', () => {
  it('comentários abertos e rascunho sobrevivem nas duas direções, sem pedir feed nem comentários de novo', async () => {
    const view = viewport(900)
    render(<main><SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} /></main>)
    const article = await screen.findByRole('article', { name: 'Publicação de @atleta.dois' })
    await userEvent.click(within(article).getByRole('button', { name: 'Comentários (1)' }))
    expect(await screen.findByText('Bom treino!')).toBeTruthy()
    await userEvent.type(screen.getByRole('textbox', { name: 'Escreva um comentário' }), 'Rascunho')

    view.resize(1440)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Publicações' })).getByRole('dialog', { name: 'Comentários' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Escreva um comentário' }) as HTMLInputElement).value).toBe('Rascunho')
    expect(screen.getByRole('article', { name: 'Publicação de @atleta.dois' })).toBe(article)

    view.resize(900)
    expect(screen.getByRole('tablist', { name: 'Comunidade' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Comentários' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Escreva um comentário' }) as HTMLInputElement).value).toBe('Rascunho')
    expect(screen.getByRole('article', { name: 'Publicação de @atleta.dois' })).toBe(article)
    expect(calls('/posts')).toBe(1)
    expect(calls('/posts/7/comments')).toBe(1)
  })

  it('aba Atletas com busca feita: os resultados continuam ao alargar e ao estreitar, sem buscar de novo', async () => {
    const view = viewport(900)
    render(<main><SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} /></main>)
    await screen.findByRole('article')
    await userEvent.click(screen.getByRole('tab', { name: /Atletas/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar atletas por nome ou @' }), 'atleta{Enter}')
    await screen.findByRole('button', { name: 'Aliado' })
    const list = results()
    expect(list).toBeTruthy()

    view.resize(1440)
    const aside = screen.getByRole('complementary', { name: 'Atletas' })
    expect(aside.contains(list)).toBe(true)
    expect(results()).toBe(list)
    expect((within(aside).getByRole('searchbox') as HTMLInputElement).value).toBe('atleta')

    view.resize(900)
    expect(screen.getByRole('tab', { name: /Atletas/ }).getAttribute('aria-selected')).toBe('true')
    expect(results()).toBe(list)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('atleta')
    expect(calls('/users?q=atleta')).toBe(1)
  })
})
