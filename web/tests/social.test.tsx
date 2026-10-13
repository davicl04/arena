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
    render(<SocialCommunity viewerId={1} onOpenUser={vi.fn()} onExpired={vi.fn()} />)

    expect(await screen.findByText('Treino do dia')).not.toBeNull()
    const like = screen.getByRole('button', { name: 'Curtir (2)' })
    expect(like.getAttribute('aria-pressed')).toBe('false')
    await user.click(like)
    await waitFor(() => expect(request).toHaveBeenCalledWith('/posts/7/like', 'PUT'))
    expect(screen.getByRole('button', { name: 'Curtir (3)' }).getAttribute('aria-pressed')).toBe('true')

    const comments = screen.getByRole('button', { name: 'Comentários (1)' })
    await user.click(comments)
    expect(comments.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByRole('dialog', { name: 'Comentários' })).not.toBeNull()
    expect(await screen.findByText('Nenhum comentário ainda. Escreva o primeiro.')).not.toBeNull()
    const send = screen.getByRole('button', { name: 'Enviar comentário' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Escreva um comentário'), { target: { value: 'Boa!' } })
    await user.click(send)
    await waitFor(() => expect(request).toHaveBeenCalledWith('/posts/7/comments', 'POST', { body: 'Boa!' }))
    expect(await screen.findByText('Boa!')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Comentários (2)' })).not.toBeNull()
    expect((screen.getByLabelText('Escreva um comentário') as HTMLInputElement).value).toBe('')
  })

  it('encontra uma conta privada na aba Atletas, cria e cancela a solicitação e abre o perfil', async () => {
    const user = userEvent.setup()
    const onOpenUser = vi.fn()
    const privatePerson = { ...person, social_public: false }
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts') return { items: [], next_cursor: null } as never
      if (path === '/users?q=Atleta') return { items: [{ ...privatePerson, follows_you: true }], next_cursor: null } as never
      if (path === '/users/1/following') return { items: [], next_cursor: null } as never
      if (path === '/users/2/follow' && method === 'PUT') return { state: 'pending' } as never
      return undefined as never
    })
    render(<SocialCommunity viewerId={1} onOpenUser={onOpenUser} onExpired={vi.fn()} />)
    await screen.findByText('A arquibancada está vazia')
    await user.click(screen.getByRole('tab', { name: 'Atletas' }))
    expect(await screen.findByText('Encontre atletas')).not.toBeNull()
    await user.type(screen.getByLabelText('Buscar atletas por nome ou @'), 'Atleta')
    // Busca enquanto digita, com espera curta: só o termo completo chega à API.
    expect(await screen.findByText('@atleta.a')).not.toBeNull()
    expect(vi.mocked(request).mock.calls.filter(([path]) => path.startsWith('/users?q='))).toEqual([['/users?q=Atleta']])
    expect(screen.getByText('Conta privada · Segue você')).not.toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Solicitar' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/follow', 'PUT'))
    await user.click(await screen.findByRole('button', { name: 'Solicitado' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/2/follow', 'DELETE'))
    expect(await screen.findByRole('button', { name: 'Solicitar' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Abrir perfil de Atleta A' }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
  })

  it('abre o perfil do autor de uma publicação', async () => {
    const onOpenUser = vi.fn()
    vi.mocked(request).mockImplementation(async path => ({ items: path === '/posts' ? [post] : [], next_cursor: null }) as never)
    render(<SocialCommunity viewerId={1} onOpenUser={onOpenUser} onExpired={vi.fn()} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Abrir perfil de @atleta.a' }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
  })
})
