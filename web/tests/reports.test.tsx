import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { Post, SocialUser } from '../src/api/client'
import AccountActions from '../src/components/AccountActions'
import PostItem from '../src/components/PostItem'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

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

const renderPost = () => renderWithToaster(<PostItem post={post} viewerId={1} onUpdate={vi.fn()} onRemoved={vi.fn()} onExpired={vi.fn()} />)

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
    expect(await findToast('Denúncia enviada para análise.')).toBeTruthy()
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
    expect(await screen.findByRole('dialog', { name: 'Comentários' })).toBeTruthy()
    const toast = await findToast('Denúncia do comentário enviada para análise.')
    expect(toast.closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
  })

  it('volta aos comentários sem enviar; a falha do envio vira toast e a sessão expirada só chama onExpired, sem fechar o formulário', async () => {
    const user = userEvent.setup()
    const onExpired = vi.fn()
    renderWithToaster(<PostItem post={post} viewerId={1} onUpdate={vi.fn()} onRemoved={vi.fn()} onExpired={onExpired} />)
    await user.click(screen.getByRole('button', { name: 'Comentários (1)' }))
    await user.click(await screen.findByRole('button', { name: 'Denunciar comentário de Outra Pessoa' }))
    await user.click(screen.getByRole('button', { name: 'Voltar aos comentários' }))
    expect(screen.getByRole('dialog', { name: 'Comentários' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Denunciar comentário de Outra Pessoa' }))
    await user.click(screen.getByRole('radio', { name: /Spam/ }))
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Não foi possível registrar agora.', 500))
    await user.click(screen.getByRole('button', { name: 'Enviar denúncia' }))
    const failure = await findToast('Não foi possível registrar agora.')
    expect(failure.closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
    expect(onExpired).not.toHaveBeenCalled()
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sessão expirada.', 401))
    await user.click(screen.getByRole('button', { name: 'Enviar denúncia' }))
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
    expect(queryToast('Sessão expirada.')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Denunciar comentário' })).not.toBeNull()
  })

  it('a legenda recusada pelo servidor (422) fica na folha; outra falha vira toast e a folha segue aberta', async () => {
    const user = userEvent.setup()
    renderWithToaster(<PostItem post={{ ...post, can_edit: true }} viewerId={1} onUpdate={vi.fn()} onRemoved={vi.fn()} onExpired={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Ações da publicação' }))
    await user.click(screen.getByRole('button', { name: 'Editar legenda' }))
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Legenda inválida.', 422, [{ field: 'caption', message: 'Legenda inválida.' }]))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar legenda' })
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Legenda inválida.')
    expect(queryToast('Legenda inválida.')).toBeNull()
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Falha ao salvar.', 500))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await findToast('Falha ao salvar.')).toBeTruthy()
    expect(within(dialog).queryByText('Legenda inválida.')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Editar legenda' })).toBeTruthy()
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
