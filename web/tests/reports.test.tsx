import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { Post, SocialUser } from '../src/api/client'
import AccountActions from '../src/components/AccountActions'
import PostItem from '../src/components/PostItem'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const author: SocialUser = { id: 2, name: 'Atleta Dois', username: 'atleta.dois', avatar_url: null, cover_url: null, social_public: true,
  post_count: 1, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'approved' }
const post: Post = { id: 7, author, caption: 'Treino', image_url: '/posts/7/image', created_at: '2026-10-10T10:00:00Z',
  like_count: 0, comment_count: 1, liked_by_me: false, can_edit: false }

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/posts/7/comments') return { items: [{ id: 11, author_id: 3, author_name: 'Outra Pessoa', author_avatar_url: null,
      body: 'Comentário ofensivo', created_at: post.created_at, can_delete: false }], next_cursor: null } as never
    return { id: 1, status: 'open' } as never
  })
})
afterEach(cleanup)

const renderPost = () => render(<PostItem post={post} viewerId={1} onUpdate={vi.fn()} onRemoved={vi.fn()} onExpired={vi.fn()} />)

describe('denúncias', () => {
  it('denuncia uma publicação de outra pessoa pelo menu •••, só depois de escolher o motivo', async () => {
    const user = userEvent.setup()
    renderPost()
    await user.click(screen.getByRole('button', { name: 'Ações da publicação' }))
    expect(screen.queryByRole('button', { name: 'Editar legenda' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Denunciar' }))
    const glass = screen.getByRole('dialog', { name: 'Denunciar publicação' })
    const send = within(glass).getByRole('button', { name: 'Enviar denúncia' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    const radios = within(glass).getAllByRole('radio')
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
    expect(within(glass).getAllByText(/^(Spam|Assédio|Conteúdo inadequado|Outro motivo)$/).map(item => item.textContent))
      .toEqual(['Spam', 'Assédio', 'Conteúdo inadequado', 'Outro motivo'])
    await user.click(within(glass).getByRole('radio', { name: /Conteúdo inadequado/ }))
    expect(within(glass).getByRole('radio', { name: /Conteúdo inadequado/ }).getAttribute('aria-checked')).toBe('true')
    expect(send.disabled).toBe(false)
    await user.click(send)
    expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'post', target_id: 7, reason: 'conteudo_inadequado' })
    expect((await screen.findByRole('status')).textContent).toBe('Denúncia enviada para análise.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('denuncia um comentário com detalhes pelo vidro dos comentários e volta à lista', async () => {
    const user = userEvent.setup()
    renderPost()
    await user.click(screen.getByRole('button', { name: 'Comentários (1)' }))
    await user.click(await screen.findByRole('button', { name: 'Denunciar comentário de Outra Pessoa' }))
    const glass = screen.getByRole('dialog', { name: 'Denunciar comentário' })
    expect(within(glass).getByText('Comentário ofensivo')).not.toBeNull()
    await user.click(within(glass).getByRole('radio', { name: /Assédio/ }))
    await user.type(within(glass).getByLabelText('Detalhes da denúncia (opcional)'), 'Ofensa direta ao atleta')
    await user.click(within(glass).getByRole('button', { name: 'Enviar denúncia' }))
    expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'comment', target_id: 11, reason: 'assedio', description: 'Ofensa direta ao atleta' })
    const comments = await screen.findByRole('dialog', { name: 'Comentários' })
    expect(within(comments).getByRole('status').textContent).toBe('Denúncia do comentário enviada para análise.')
  })

  it('volta aos comentários sem enviar e mostra o erro da API sem fechar o formulário', async () => {
    const user = userEvent.setup()
    const onExpired = vi.fn()
    render(<PostItem post={post} viewerId={1} onUpdate={vi.fn()} onRemoved={vi.fn()} onExpired={onExpired} />)
    await user.click(screen.getByRole('button', { name: 'Comentários (1)' }))
    await user.click(await screen.findByRole('button', { name: 'Denunciar comentário de Outra Pessoa' }))
    await user.click(screen.getByRole('button', { name: 'Voltar aos comentários' }))
    expect(screen.getByRole('dialog', { name: 'Comentários' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Denunciar comentário de Outra Pessoa' }))
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sessão expirada.', 401))
    await user.click(screen.getByRole('radio', { name: /Spam/ }))
    await user.click(screen.getByRole('button', { name: 'Enviar denúncia' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Sessão expirada.')
    expect(onExpired).toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Denunciar comentário' })).not.toBeNull()
  })

  it('denuncia a conta com detalhes pelo vidro de tela cheia', async () => {
    const user = userEvent.setup()
    const onReported = vi.fn()
    render(<AccountActions person={author} onClose={vi.fn()} onBlocked={vi.fn()} onReported={onReported} onExpired={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Denunciar conta' }))
    expect(screen.getByText('Por que você quer denunciar esta conta?')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Enviar denúncia' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('radio', { name: /Outro motivo/ }))
    await user.type(screen.getByLabelText('Detalhes da denúncia (opcional)'), '  Perfil falso  ')
    await user.click(screen.getByRole('button', { name: 'Enviar denúncia' }))
    expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'user', target_id: 2, reason: 'outro', description: 'Perfil falso' })
    await waitFor(() => expect(onReported).toHaveBeenCalled())
  })
})
