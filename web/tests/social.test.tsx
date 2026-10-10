import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import SocialCommunity from '../src/components/SocialCommunity'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
  apiUrl: (path: string) => path,
}))

const person = { id: 2, name: 'Atleta A', username: 'atleta.a', avatar_url: null, cover_url: null, social_public: true,
  post_count: 1, follower_count: 3, following_count: 2, follows_you: false, follow_state: 'none' as const }
const post = { id: 7, author: person, caption: 'Treino do dia', image_url: '/post.webp',
  created_at: '2026-10-10T10:00:00Z', like_count: 2, comment_count: 1, liked_by_me: false, can_edit: false }

describe('SocialCommunity', () => {
  beforeEach(() => { vi.mocked(request).mockReset() })
  afterEach(cleanup)

  it('carrega o feed, curte e publica um comentário', async () => {
    const user = userEvent.setup()
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts') return { items: [post], next_cursor: null } as never
      if (path === '/posts/7/like') return undefined as never
      if (path === '/posts/7/comments' && method === 'POST') return { id: 9, author_id: 1, author_name: 'Eu', author_avatar_url: null,
        body: 'Boa!', created_at: '2026-10-10T10:01:00Z', can_delete: true } as never
      if (path === '/posts/7/comments') return { items: [], next_cursor: null } as never
      return { items: [], next_cursor: null } as never
    })
    render(<SocialCommunity onOpenUser={vi.fn()} onExpired={vi.fn()} />)

    expect(await screen.findByText(/Treino do dia/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /curtir · 2/i }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/posts/7/like', 'PUT'))
    expect(screen.getByRole('button', { name: /curtir · 3/i })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /comentários · 1/i }))
    const input = await screen.findByLabelText('Escreva um comentário')
    fireEvent.change(input, { target: { value: 'Boa!' } })
    await user.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/posts/7/comments', 'POST', { body: 'Boa!' }))
  })

  it('encontra uma conta privada, cria e cancela a solicitação e abre o perfil', async () => {
    const user = userEvent.setup()
    const onOpenUser = vi.fn()
    const privatePerson = { ...person, social_public: false }
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts') return { items: [], next_cursor: null } as never
      if (path === '/users?q=Atleta') return { items: [privatePerson], next_cursor: null } as never
      if (path === '/users/2/follow' && method === 'PUT') return { state: 'pending' } as never
      return undefined as never
    })
    render(<SocialCommunity onOpenUser={onOpenUser} onExpired={vi.fn()} />)
    await screen.findByText('Seu feed começa aqui')
    await user.type(screen.getByLabelText('Buscar atletas por nome ou @'), 'Atleta')
    await user.click(screen.getByRole('button', { name: 'Buscar atletas' }))
    expect(await screen.findByText('@atleta.a')).not.toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Seguir' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/follow', 'PUT'))
    await user.click(await screen.findByRole('button', { name: 'Solicitado' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/follow', 'DELETE'))
    expect(await screen.findByRole('button', { name: 'Seguir' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Abrir perfil de Atleta A' }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
  })

  it('abre o perfil do autor de uma publicação', async () => {
    const onOpenUser = vi.fn()
    vi.mocked(request).mockImplementation(async path => ({ items: path === '/posts' ? [post] : [], next_cursor: null }) as never)
    render(<SocialCommunity onOpenUser={onOpenUser} onExpired={vi.fn()} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Atleta A/ }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
  })
})
