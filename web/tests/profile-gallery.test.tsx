import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import type { Post, SocialComment, SocialUser } from '../src/api/client'
import ProfileGallery from '../src/components/ProfileGallery'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const me: SocialUser = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', avatar_url: null, cover_url: null, social_public: true,
  post_count: 3, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self' }
const makePost = (id: number, caption: string, extra: Partial<Post> = {}): Post => ({ id, author: me, caption, image_url: `/posts/${id}/image`,
  created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: true, ...extra })
const comment = (id: number, body: string, extra: Partial<SocialComment> = {}): SocialComment => ({ id, author_id: 3, author_name: 'Comentarista',
  author_avatar_url: null, body, created_at: '2026-10-10T10:05:00Z', can_delete: true, ...extra })

let posts: Post[]
let morePosts: Post[]
beforeEach(() => {
  posts = [makePost(7, 'Primeira'), makePost(8, 'Segunda', { comment_count: 2 }), makePost(9, 'Terceira')]
  morePosts = []
  vi.mocked(request).mockReset()
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    if (path === '/users/1/posts') return { items: posts, next_cursor: morePosts.length ? 'gallery-next' : null } as never
    if (path === '/users/1/posts?cursor=gallery-next') return { items: morePosts, next_cursor: null } as never
    if (path === '/posts/8/comments' && method === 'POST') return comment(30, (body as { body: string }).body, { author_id: 1, author_name: 'Eu Mesmo' }) as never
    if (path === '/posts/8/comments') return { items: [comment(21, 'Comentário recente')], next_cursor: 'comments-next' } as never
    if (path === '/posts/8/comments?cursor=comments-next') return { items: [comment(20, 'Comentário antigo')], next_cursor: null } as never
    if (path === '/posts/8' && method === 'PATCH') return { ...posts[1], caption: (body as { caption: string }).caption } as never
    return undefined as never
  })
})
afterEach(cleanup)

const renderGallery = (props: Partial<React.ComponentProps<typeof ProfileGallery>> = {}) => {
  const all = { userId: 1, username: 'eu.mesmo', ownerName: 'Eu Mesmo', viewerId: 1, own: true, onNewPhoto: vi.fn(), onExpired: vi.fn(), ...props }
  render(<ProfileGallery {...all} />)
  return all
}
const tile = (caption: string) => screen.findByRole('button', { name: new RegExp(`Abrir publicação .*: ${caption}$`) })
const viewer = () => screen.getByRole('dialog', { name: 'Publicações' })
const postOf = (caption: string) => within(viewer()).getByText(caption).closest('article') as HTMLElement

describe('ProfileGallery e PostViewer', () => {
  it('abre o visualizador posicionado no post tocado e carrega mais publicações ao chegar ao fim', async () => {
    morePosts = [makePost(10, 'Quarta')]
    const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = []
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { observers.push(callback) }
      observe() {}
      disconnect() {}
    })
    const offset = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return Number(this.dataset.postId ?? 0) * 100
    })
    const user = userEvent.setup()
    renderGallery()
    await user.click(await tile('Segunda'))
    const dialog = viewer()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getByText('@eu.mesmo')).not.toBeNull()
    expect(within(dialog).getByTestId('viewer-scroll').scrollTop).toBe(800)
    expect(within(dialog).getAllByRole('article').map(item => item.getAttribute('aria-label'))).toHaveLength(3)
    act(() => observers.at(-1)?.([{ isIntersecting: true }]))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/users/1/posts?cursor=gallery-next'))
    expect(await within(viewer()).findByText('Quarta')).not.toBeNull()
    expect(within(viewer()).queryByRole('button', { name: 'Carregar mais publicações' })).toBeNull()
    offset.mockRestore()
  })

  it('curte e descurte, refletindo a contagem no post', async () => {
    const user = userEvent.setup()
    renderGallery()
    await user.click(await tile('Segunda'))
    await user.click(within(postOf('Segunda')).getByRole('button', { name: 'Curtir (0)' }))
    expect(request).toHaveBeenCalledWith('/posts/8/like', 'PUT')
    const liked = await within(postOf('Segunda')).findByRole('button', { name: 'Curtir (1)' })
    expect(liked.getAttribute('aria-pressed')).toBe('true')
    await user.click(liked)
    expect(request).toHaveBeenCalledWith('/posts/8/like', 'DELETE')
    expect(await within(postOf('Segunda')).findByRole('button', { name: 'Curtir (0)' })).not.toBeNull()
  })

  it('comenta, carrega mais e exclui comentários mantendo a contagem do post', async () => {
    const user = userEvent.setup()
    renderGallery()
    await user.click(await tile('Segunda'))
    const post = postOf('Segunda')
    await user.click(within(post).getByRole('button', { name: 'Comentários (2)' }))
    const glass = within(post).getByRole('dialog', { name: 'Comentários' })
    expect(await within(glass).findByText('Comentário recente')).not.toBeNull()
    // Comentário de outra pessoa no próprio post: pode denunciar e excluir.
    expect(within(glass).getByRole('button', { name: 'Denunciar comentário de Comentarista' })).not.toBeNull()
    await user.click(within(glass).getByRole('button', { name: 'Carregar mais comentários' }))
    expect(await within(glass).findByText('Comentário antigo')).not.toBeNull()
    expect(request).toHaveBeenCalledWith('/posts/8/comments?cursor=comments-next')

    fireEvent.change(within(glass).getByLabelText('Escreva um comentário'), { target: { value: '  Valeu!  ' } })
    await user.click(within(glass).getByRole('button', { name: 'Enviar comentário' }))
    expect(request).toHaveBeenCalledWith('/posts/8/comments', 'POST', { body: 'Valeu!' })
    expect(await within(glass).findByText('Valeu!')).not.toBeNull()
    expect(within(glass).queryByRole('button', { name: 'Denunciar comentário de Eu Mesmo' })).toBeNull()
    expect(within(glass).getByText('3')).not.toBeNull()

    await user.click(within(glass).getByRole('button', { name: 'Excluir comentário de Eu Mesmo' }))
    expect(request).toHaveBeenCalledWith('/comments/30', 'DELETE')
    await waitFor(() => expect(within(glass).queryByText('Valeu!')).toBeNull())
    await user.click(within(glass).getByRole('button', { name: 'Fechar comentários' }))
    expect(within(post).getByRole('button', { name: 'Comentários (2)' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('abre um vidro por vez: o menu fecha os comentários', async () => {
    const user = userEvent.setup()
    renderGallery()
    await user.click(await tile('Segunda'))
    const post = postOf('Segunda')
    await user.click(within(post).getByRole('button', { name: 'Comentários (2)' }))
    expect(within(post).getByRole('dialog', { name: 'Comentários' })).not.toBeNull()
    await user.click(within(post).getByRole('button', { name: 'Ações da publicação' }))
    expect(within(post).queryByRole('dialog', { name: 'Comentários' })).toBeNull()
    expect(within(post).getByRole('dialog', { name: 'Ações da publicação' })).not.toBeNull()
  })

  it('edita a legenda com contador e devolve o foco ao quadro ao fechar com Esc', async () => {
    const user = userEvent.setup()
    renderGallery()
    await user.click(await tile('Segunda'))
    await user.click(within(postOf('Segunda')).getByRole('button', { name: 'Ações da publicação' }))
    await user.click(screen.getByRole('button', { name: 'Editar legenda' }))
    const field = screen.getByLabelText('Legenda') as HTMLTextAreaElement
    expect(document.activeElement).toBe(field)
    expect(field.maxLength).toBe(2200)
    await user.clear(field)
    await user.type(field, 'Nova legenda')
    expect(screen.getByText('12/2200')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(request).toHaveBeenCalledWith('/posts/8', 'PATCH', { caption: 'Nova legenda' })
    expect(await within(viewer()).findByText('Nova legenda')).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Publicações' })).toBeNull()
    expect(document.activeElement).toBe(await tile('Nova legenda'))
  })

  it('exclui com confirmação, tira o post da grade e fecha ao excluir o último', async () => {
    const user = userEvent.setup()
    posts = [makePost(7, 'Primeira'), makePost(8, 'Segunda')]
    renderGallery()
    await user.click(await tile('Segunda'))
    await user.click(within(postOf('Segunda')).getByRole('button', { name: 'Ações da publicação' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(screen.getByText('Excluir publicação?')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(request).not.toHaveBeenCalledWith('/posts/8', 'DELETE')
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(request).toHaveBeenCalledWith('/posts/8', 'DELETE')
    await waitFor(() => expect(within(viewer()).queryByText('Segunda')).toBeNull())
    expect(screen.queryByRole('button', { name: /Abrir publicação .*: Segunda/ })).toBeNull()

    await user.click(within(postOf('Primeira')).getByRole('button', { name: 'Ações da publicação' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(request).toHaveBeenCalledWith('/posts/7', 'DELETE')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Publicações' })).toBeNull())
    expect(screen.getByText('Nenhuma foto por aqui')).not.toBeNull()
  })

  it('completa a última linha com "Nova foto" só no próprio perfil e trata estados de erro e vazio', async () => {
    const user = userEvent.setup()
    posts = [makePost(7, 'Primeira')]
    const props = renderGallery()
    await user.click(await screen.findByRole('button', { name: 'Nova foto' }))
    expect(props.onNewPhoto).toHaveBeenCalled()
    // Quadros fantasmas completam a linha: filhos decorativos (aria-hidden) da grade, fora dos itens da lista.
    expect(screen.getByRole('list', { name: 'Fotos de Eu Mesmo' }).querySelectorAll(':scope > [aria-hidden="true"]')).toHaveLength(1)
    cleanup()
    renderGallery({ own: false, onNewPhoto: undefined, viewerId: 2 })
    await tile('Primeira')
    expect(screen.queryByRole('button', { name: 'Nova foto' })).toBeNull()
    cleanup()
    posts = []
    renderGallery({ own: false, onNewPhoto: undefined, viewerId: 2 })
    expect(await screen.findByText('Quando esta conta publicar fotos, elas aparecerão aqui.')).not.toBeNull()
    cleanup()
    vi.mocked(request).mockRejectedValueOnce(new Error('Falha de rede'))
    renderGallery()
    expect((await screen.findByRole('alert')).textContent).toContain('Falha de rede')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('button', { name: 'Publicar foto' })).not.toBeNull()
  })
})
