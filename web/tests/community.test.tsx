import { StrictMode, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { Post, SocialUser, User } from '../src/api/client'
import SocialCommunity from '../src/components/SocialCommunity'
import ArenaPage from '../src/pages/ArenaPage'
import { cropImage } from '../src/utils/cropImage'
import { CONNECTION_LOAD_TEXT } from '../src/components/ui/load-error'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))
vi.mock('../src/utils/cropImage', async original => ({
  ...await original<typeof import('../src/utils/cropImage')>(),
  cropImage: vi.fn(async () => new Blob(['webp'], { type: 'image/webp' })),
}))
/* Recorte simulado: informa a área ao montar e expõe zoom, giro e posição para conferência. */
vi.mock('react-easy-crop', () => ({
  default: function FakeCropper({ zoom, rotation, crop, onCropComplete }: { zoom: number; rotation: number; crop: { x: number; y: number }
    onCropComplete: (area: unknown, pixels: { x: number; y: number; width: number; height: number }) => void }) {
    useEffect(() => { onCropComplete({}, { x: 0, y: 0, width: 50, height: 50 }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
    return <div data-testid="cropper" data-zoom={zoom} data-rotation={rotation} data-crop={`${crop.x},${crop.y}`} />
  },
}))

const athlete: SocialUser = { id: 2, name: 'Atleta Dois', username: 'atleta.dois', avatar_url: null, cover_url: null, social_public: true,
  post_count: 1, follower_count: 3, following_count: 2, follows_you: false, follow_state: 'approved' }
const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu', email: 'eu@example.com', birth_date: '1990-01-01',
  social_public: true, is_admin: false, avatar: null, cover: null }
const post: Post = { id: 7, author: athlete, caption: 'Treino do dia', image_url: '/post.webp', created_at: '2026-10-10T10:00:00Z',
  like_count: 2, comment_count: 1, liked_by_me: false, can_edit: false }
const page = (items: unknown[], next_cursor: string | null = null) => ({ items, next_cursor })
const postCalls = () => vi.mocked(request).mock.calls.filter(([path, method]) => path === '/posts' && !method).length

function mockApi(feed: () => unknown = () => page([post])) {
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/posts' && method === 'POST') return { ...post, id: 99, caption: 'Nova', author: { ...athlete, id: 1, username: 'eu' } } as never
    if (path === '/posts') return feed() as never
    if (path === '/cities' || path === '/me/sports-profiles') return [] as never
    if (path === '/users/1') return { ...athlete, id: me.id, name: me.name, username: me.username, follow_state: 'self' } as never
    if (path === '/users/2') return athlete as never
    if (path === '/users/1/posts') return page([{ ...post, author: { ...athlete, id: me.id, name: me.name, username: me.username } }]) as never
    if (path === '/users/1/following') return page([{ user: athlete, state: 'approved' }]) as never
    return page([]) as never
  })
}
/** Monta a Comunidade dentro de um `main` rolável, como no app. */
function renderInMain(props: Partial<Parameters<typeof SocialCommunity>[0]> = {}) {
  const onOpenUser = vi.fn()
  renderWithToaster(<main><SocialCommunity viewerId={1} onOpenUser={onOpenUser} onExpired={vi.fn()} {...props} /></main>)
  return { onOpenUser, main: document.querySelector('main')! }
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(cropImage).mockClear()
  Element.prototype.scrollTo = vi.fn() // jsdom não implementa rolagem
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Comunidade', () => {
  it('mostra a barra escura com abas; tocar em Publicações já ativa só volta ao início', async () => {
    mockApi()
    const ui = userEvent.setup()
    const { main } = renderInMain()
    expect(await screen.findByText('Treino do dia')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Comunidade' })).not.toBeNull()
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Publicações', 'Atletas'])
    const calls = postCalls()
    await ui.click(screen.getByRole('tab', { name: 'Publicações' }))
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(postCalls()).toBe(calls)
  })

  it('mostra o autor como @usuário e a data no início da legenda, com a foto quadrada', async () => {
    mockApi()
    renderInMain()
    const author = await screen.findByRole('button', { name: 'Abrir perfil de @atleta.dois' })
    expect(author.textContent).toBe('AD@atleta.dois')
    expect(screen.queryByText('Atleta Dois')).toBeNull()
    const caption = screen.getByText('Treino do dia')
    expect(caption.querySelector('time')?.getAttribute('dateTime')).toBe(post.created_at)
    expect(screen.getByRole('img', { name: 'Treino do dia' }).className).toContain('aspect-square')
  })

  it('mostra o estado vazio com Publicar foto e Buscar atletas', async () => {
    mockApi(() => page([]))
    const ui = userEvent.setup()
    renderInMain()
    expect(await screen.findByText('A arquibancada está vazia')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Publicar foto' }))
    expect(screen.getByRole('dialog', { name: 'Nova publicação' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    await ui.click(screen.getByRole('button', { name: 'Buscar atletas' }))
    expect(screen.getByRole('tab', { name: 'Atletas' }).getAttribute('aria-selected')).toBe('true')
  })

  it('mostra o erro do feed e tenta de novo', async () => {
    let fail = true
    mockApi(() => { if (fail) throw new Error('offline'); return page([post]) })
    const ui = userEvent.setup()
    renderInMain()
    expect(await screen.findByText('Feed indisponível')).not.toBeNull()
    fail = false
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Treino do dia')).not.toBeNull()
  })

  it('carrega mais pelo botão e mostra o cartão de fim da lista', async () => {
    mockApi(() => page([post], 'next'))
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/posts?cursor=next') return page([{ ...post, id: 8, caption: 'Treino antigo' }]) as never
      if (path === '/posts') return page([post], 'next') as never
      return page([]) as never
    })
    const ui = userEvent.setup()
    renderInMain()
    await ui.click(await screen.findByRole('button', { name: 'Carregar mais publicações' }))
    expect(await screen.findByText('Treino antigo')).not.toBeNull()
    expect(screen.getByText('Chegou ao fim')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Publicar' })).not.toBeNull()
  })

  it('lista quem você segue na aba Atletas antes de buscar', async () => {
    mockApi()
    const ui = userEvent.setup()
    const { onOpenUser } = renderInMain()
    await ui.click(await screen.findByRole('tab', { name: 'Atletas' }))
    expect(await screen.findByText(/Quem você segue/)).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Abrir perfil de Atleta Dois' }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
    expect(request).toHaveBeenCalledWith('/users/1/following')
  })
})

describe('Atualizar o feed', () => {
  it('atualiza ao puxar o feed no topo além do limite, mas não com um puxão curto', async () => {
    mockApi()
    const { main } = renderInMain()
    await screen.findByText('Treino do dia')
    const calls = postCalls()
    fireEvent.touchStart(main, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(main, { touches: [{ clientY: 140 }] })
    expect(screen.getByText('Puxe para atualizar')).not.toBeNull()
    fireEvent.touchEnd(main)
    expect(postCalls()).toBe(calls)

    fireEvent.touchStart(main, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(main, { touches: [{ clientY: 300 }] })
    expect(screen.getByText('Solte para atualizar')).not.toBeNull()
    fireEvent.touchEnd(main)
    await waitFor(() => expect(postCalls()).toBe(calls + 1))
    expect(await screen.findByText('Treino do dia')).not.toBeNull()
  })

  it('atualiza com a roda do mouse para cima quando o gesto começa no topo', async () => {
    mockApi()
    const { main } = renderInMain()
    await screen.findByText('Treino do dia')
    const calls = postCalls()
    fireEvent.wheel(main, { deltaY: -400 })
    await waitFor(() => expect(postCalls()).toBe(calls + 1))
  })

  it('oferece um botão de atualizar para o teclado', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderInMain()
    await screen.findByText('Treino do dia')
    const calls = postCalls()
    await ui.click(screen.getByRole('button', { name: 'Atualizar feed' }))
    await waitFor(() => expect(postCalls()).toBe(calls + 1))
  })
})

describe('Nova publicação', () => {
  it('publica a partir de Nova foto sem reabrir o compositor ao visitar outro perfil e voltar', async () => {
    mockApi()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() })
    const ui = userEvent.setup()
    render(<StrictMode><ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} /></StrictMode>)
    const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
    await ui.click(nav.getByRole('button', { name: 'Perfil' }))
    await ui.click(await screen.findByRole('button', { name: 'Nova foto' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova publicação' })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'quadra.png', { type: 'image/png' })] } })
    await ui.click(screen.getByRole('button', { name: 'Continuar' }))
    await ui.type(await screen.findByLabelText('Legenda (opcional)'), 'Nova')
    await ui.click(within(dialog).getByRole('button', { name: 'Publicar' }))
    const shared = await findToast('Publicação compartilhada.')
    expect(shared.closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(screen.queryByRole('dialog', { name: 'Nova publicação' })).toBeNull()
    expect(screen.getAllByRole('article')[0].getAttribute('aria-label')).toBe('Publicação de @eu')

    await ui.click(screen.getByRole('button', { name: 'Abrir perfil de @atleta.dois' }))
    await screen.findByRole('region', { name: 'Perfil de Atleta Dois' })
    await ui.click(screen.getByRole('button', { name: 'Voltar', exact: true }))
    expect(screen.getByRole('region', { name: 'Comunidade Arena' })).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Nova publicação' })).toBeNull()

    await ui.click(nav.getByRole('button', { name: 'Perfil' }))
    await ui.click(await screen.findByRole('button', { name: 'Nova foto' }))
    expect(screen.getByRole('dialog', { name: 'Nova publicação' })).not.toBeNull()
  })

  it('recorta (atalhos, girar, centralizar, redefinir), escreve a legenda e publica no topo do feed', async () => {
    mockApi()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() })
    const ui = userEvent.setup()
    renderInMain()
    await screen.findByText('Treino do dia')
    await ui.click(screen.getByRole('button', { name: 'Nova publicação' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova publicação' })
    expect(document.activeElement?.textContent).toBe('Escolher foto')
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'quadra.png', { type: 'image/png' })] } })

    const cropper = screen.getByTestId('cropper')
    expect(screen.getByRole('list', { name: 'Etapas da publicação' }).textContent).toContain('Recorte')
    expect(within(dialog).queryByRole('button', { name: 'Publicar' })).toBeNull()
    await ui.click(screen.getByRole('button', { name: '2×' }))
    expect(cropper.getAttribute('data-zoom')).toBe('2')
    expect(screen.getByRole('button', { name: '2×' }).getAttribute('aria-pressed')).toBe('true')
    await ui.click(screen.getByRole('button', { name: 'Girar 90 graus' }))
    expect(cropper.getAttribute('data-rotation')).toBe('90')
    await ui.click(screen.getByRole('button', { name: 'Redefinir' }))
    expect([cropper.getAttribute('data-zoom'), cropper.getAttribute('data-rotation')]).toEqual(['1', '0'])
    await ui.click(screen.getByRole('button', { name: 'Centralizar' }))
    expect(cropper.getAttribute('data-crop')).toBe('0,0')
    await ui.click(screen.getByRole('button', { name: 'Girar 90 graus' }))

    await ui.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(cropImage).toHaveBeenCalledWith('blob:foto', { x: 0, y: 0, width: 50, height: 50 }, expect.objectContaining({ rotation: 90 }))
    const caption = await screen.findByLabelText('Legenda (opcional)')
    expect(document.activeElement).toBe(caption)
    await ui.type(caption, 'Nova')
    expect(screen.getByText('4/2.200')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Recorte concluído: voltar ao recorte' }))
    expect(screen.getByTestId('cropper')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Continuar' }))
    await ui.click(await within(dialog).findByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(request).toHaveBeenCalledWith('/posts', 'POST', expect.any(FormData)))
    const form = vi.mocked(request).mock.calls.find(([, method]) => method === 'POST')![2] as FormData
    expect(form.get('caption')).toBe('Nova')
    expect((form.get('file') as File).name).toBe('quadra.webp')
    expect(await findToast('Publicação compartilhada.')).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Nova publicação' })).toBeNull()
    expect(screen.getAllByRole('article')[0].getAttribute('aria-label')).toBe('Publicação de @eu')
  })

  it('abre direto na nova publicação e recusa arquivo inválido', async () => {
    mockApi()
    renderInMain({ composeOnOpen: true })
    const dialog = screen.getByRole('dialog', { name: 'Nova publicação' })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'nota.txt', { type: 'text/plain' })] } })
    expect(screen.getByRole('alert').textContent).toContain('JPEG, PNG ou WebP')
    expect(screen.queryByTestId('cropper')).toBeNull()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Nova publicação' })).toBeNull()
  })
})

describe('Falhas da Comunidade', () => {
  it('feed sem conexão mostra o texto de conexão no erro de carregamento', async () => {
    mockApi(() => { throw new ApiError('Serviço fora do ar.', 503) })
    renderInMain()
    expect(await screen.findByText('Feed indisponível')).not.toBeNull()
    expect(screen.getByText(CONNECTION_LOAD_TEXT)).not.toBeNull()
  })

  it('a curtida que falha vira toast de erro', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderInMain()
    await screen.findByText('Treino do dia')
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/posts/7/like') throw new ApiError('Não foi possível curtir agora.', 500)
      return page([post]) as never
    })
    await ui.click(screen.getByRole('button', { name: 'Curtir (2)' }))
    const failure = await findToast('Não foi possível curtir agora.')
    expect(failure.closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
    expect(screen.getByRole('button', { name: 'Curtir (2)' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('a curtida sem conexão não mostra toast nem mensagem na publicação', async () => {
    mockApi()
    const ui = userEvent.setup()
    renderInMain()
    await screen.findByText('Treino do dia')
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/posts/7/like') throw new ApiError('Sem conexão', 503)
      return page([post]) as never
    })
    await ui.click(screen.getByRole('button', { name: 'Curtir (2)' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Curtir (2)' }) as HTMLButtonElement).disabled).toBe(false))
    expect(queryToast(/Sem conexão|curtida/)).toBeNull()
  })

  it('a busca de atletas que falha mostra o erro da seção com "Tentar novamente"', async () => {
    mockApi()
    vi.mocked(request).mockImplementation(async path => {
      if (path.startsWith('/users?q=')) throw new ApiError('Busca fora do ar.', 500)
      if (path === '/posts') return page([post]) as never
      return page([]) as never
    })
    const ui = userEvent.setup()
    renderInMain()
    await ui.click(await screen.findByRole('tab', { name: 'Atletas' }))
    await ui.type(screen.getByLabelText('Buscar atletas por nome ou @'), 'ana{Enter}')
    const alert = await screen.findByText('Busca indisponível')
    expect(alert.closest('[data-slot="load-error"]')?.getAttribute('data-size')).toBe('section')
    expect(screen.getByText('Busca fora do ar.')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
  })

  it('seguir que falha vira toast de erro e o botão não muda', async () => {
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path.startsWith('/users?q=')) return page([{ ...athlete, id: 5, name: 'Ana Souza', username: 'ana', follow_state: 'none' }]) as never
      if (path === '/users/5/follow' && method === 'PUT') throw new ApiError('Não foi possível seguir.', 500)
      return (path === '/posts' ? page([post]) : page([])) as never
    })
    const ui = userEvent.setup()
    renderInMain()
    await ui.click(await screen.findByRole('tab', { name: 'Atletas' }))
    await ui.type(screen.getByLabelText('Buscar atletas por nome ou @'), 'ana{Enter}')
    await ui.click(await screen.findByRole('button', { name: 'Seguir' }))
    const failure = await findToast('Não foi possível seguir.')
    expect(failure.closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
    expect(screen.getByRole('button', { name: 'Seguir' })).not.toBeNull()
  })

  it('os comentários que falham ao carregar mostram o erro da seção no vidro e recarregam', async () => {
    let fail = true
    mockApi()
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/posts/7/comments') {
        if (fail) throw new ApiError('Comentários fora do ar.', 500)
        return page([{ id: 11, author_id: 3, author_name: 'Outra Pessoa', author_avatar_url: null, body: 'Boa!', created_at: post.created_at, can_delete: false }]) as never
      }
      return page([post]) as never
    })
    const ui = userEvent.setup()
    renderInMain()
    await ui.click(await screen.findByRole('button', { name: 'Comentários (1)' }))
    const title = await screen.findByText('Comentários indisponíveis')
    expect(title.closest('[data-slot="load-error"]')?.getAttribute('data-tone')).toBe('dark')
    fail = false
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Boa!')).not.toBeNull()
  })
})
