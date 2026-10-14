import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ImagePicker from 'expo-image-picker'
import { ApiError, request } from '../src/api/client'
import type { Post, SocialUser } from '../src/api/client'
import CommunityScreen from '../src/screens/CommunityScreen'
import { button, byLabel, click, enableAct, press, searchAthletes, textOf, type } from './support/native'
import { toasts, toastText } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', () => ({
  positions: [],
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  request: vi.fn(),
}))

type Tree = ReturnType<typeof create>
type Handler = (path: string, method?: string, body?: unknown) => unknown

const me = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const person = (id: number, extra: Partial<SocialUser> = {}): SocialUser => ({ id, name: `Pessoa ${id}`, username: `pessoa.${id}`, avatar_url: null, cover_url: null,
  social_public: true, post_count: 0, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none', ...extra })
const athlete = person(2, { name: 'Atleta A', username: 'atleta.a' })
const makePost = (id: number, extra: Partial<Post> = {}): Post => ({ id, author: athlete, caption: `Foto ${id}`, image_url: `/posts/${id}/image`,
  created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: false, ...extra })
const page = <T>(items: T[], next: string | null = null) => ({ items, next_cursor: next })

const scroller = { scrollToOffset: vi.fn(), scrollToIndex: vi.fn() }
const nodeMock = (element: { type: unknown }) => element.type === 'FlatList' ? scroller : null

/** Rotas padrão: feed com um post, ninguém seguido e busca vazia; `handler` sobrepõe o que precisar. */
function serve(handler: Handler = () => undefined) {
  vi.mocked(request).mockImplementation(async (path: string, method?: string, body?: unknown) => {
    const answer = await handler(path, method, body)
    if (answer !== undefined) return answer as never
    if (path === '/posts') return page([makePost(7)]) as never
    if (path.startsWith('/users/1/following')) return page([]) as never
    if (path.startsWith('/users?q=')) return page([]) as never
    return undefined as never
  })
}

async function mount(props: Partial<React.ComponentProps<typeof CommunityScreen>> = {}) {
  let tree!: Tree
  await act(async () => { tree = create(React.createElement(CommunityScreen, { user: me, onExpired: vi.fn(), ...props }), { createNodeMock: nodeMock }) })
  return tree
}
const tab = (tree: Tree, label: string) => tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label)[0]
const feedList = (tree: Tree) => tree.root.findAllByType('FlatList' as never)[0]
const postsCalls = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/posts')
const asset = (uri = 'file:///foto.jpg', extra: Partial<ImagePicker.ImagePickerAsset> = {}) => ({ uri, width: 1080, height: 1080, fileName: 'foto.jpg', mimeType: 'image/jpeg', fileSize: 1000, ...extra })
const picked = (...assets: ReturnType<typeof asset>[]) => ({ canceled: false, assets }) as unknown as ImagePicker.ImagePickerResult

describe('Comunidade: barra, abas e feed', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset(); scroller.scrollToOffset.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('o sino das Notificações é um círculo de vidro na barra escura, antes do "+", com o número de novas', async () => {
    serve()
    const onOpenNotifications = vi.fn()
    const tree = await mount({ notificationCount: 7, onOpenNotifications })
    expect(byLabel(tree, 'Notificações, 7 novas')).toHaveLength(1)
    await press(tree, 'Notificações, 7 novas')
    expect(onOpenNotifications).toHaveBeenCalledTimes(1)
    const labels = tree.root.findAll(node => String(node.type) === 'Pressable').map(node => node.props.accessibilityLabel)
    expect(labels.indexOf('Notificações, 7 novas')).toBeLessThan(labels.indexOf('Nova publicação'))
    // Sem a abertura (a tela fora do shell) a barra não mostra o sino.
    const bare = await mount()
    expect(byLabel(bare, 'Notificações')).toHaveLength(0)
  })

  it('mostra a barra com título, + e abas; tocar em Publicações ativa só volta ao topo', async () => {
    serve()
    const tree = await mount()
    expect(textOf(tree)).toContain('Comunidade')
    expect(byLabel(tree, 'Nova publicação')).toHaveLength(1)
    expect(tab(tree, 'Publicações').props.accessibilityState.selected).toBe(true)
    expect(tab(tree, 'Atletas').props.accessibilityState.selected).toBe(false)
    // Feed de ponta a ponta com o post 1:1 e a barra animada pelo scroll da lista.
    expect(textOf(tree)).toContain('Foto 7')
    expect(feedList(tree).props.onScroll).toEqual(expect.any(Function))
    await press(tree, 'Publicações')
    expect(scroller.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true })
    expect(postsCalls()).toHaveLength(1)

    await press(tree, 'Atletas')
    expect(tab(tree, 'Atletas').props.accessibilityState.selected).toBe(true)
    expect(byLabel(tree, 'Buscar atletas por nome ou @')[0].props.placeholder).toBe('Buscar atletas pelo nome ou @')
    // O feed continua montado (escondido) para manter a posição e os dados.
    expect(feedList(tree)).toBeTruthy()
    await press(tree, 'Publicações')
    expect(byLabel(tree, 'Buscar atletas por nome ou @')).toHaveLength(0)
    expect(scroller.scrollToOffset).toHaveBeenCalledTimes(1)
    expect(postsCalls()).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('puxar para atualizar relê a primeira página sem esvaziar o feed', async () => {
    let release!: () => void
    let reads = 0
    serve(async path => {
      if (path !== '/posts') return undefined
      reads += 1
      if (reads === 1) return page([makePost(7, { caption: 'Antiga' })])
      await new Promise<void>(resolve => { release = resolve })
      return page([makePost(8, { caption: 'Nova' }), makePost(7, { caption: 'Antiga' })])
    })
    const tree = await mount()
    const refresh = () => feedList(tree).props.refreshControl as React.ReactElement<{ refreshing: boolean; onRefresh: () => void; colors: string[] }>
    expect(refresh().props.refreshing).toBe(false)
    await act(async () => { refresh().props.onRefresh() })
    expect(postsCalls()).toHaveLength(2)
    expect(refresh().props.refreshing).toBe(true)
    expect(textOf(tree)).toContain('Antiga')
    expect(byLabel(tree, 'Carregando publicações')).toHaveLength(0)
    await act(async () => { release() })
    expect(refresh().props.refreshing).toBe(false)
    expect(textOf(tree)).toContain('Nova')
    await act(async () => { tree.unmount() })
  })

  it('carregando: barra de progresso e esqueleto; vazio: arquibancada com Publicar foto e Buscar atletas', async () => {
    let release!: () => void
    serve(async path => {
      if (path !== '/posts') return undefined
      await new Promise<void>(resolve => { release = resolve })
      return page([])
    })
    const tree = await mount()
    const progress = byLabel(tree, 'Carregando publicações')
    expect(progress).toHaveLength(1)
    expect(progress[0].props.accessibilityRole).toBe('progressbar')
    await act(async () => { release() })
    expect(byLabel(tree, 'Carregando publicações')).toHaveLength(0)
    expect(textOf(tree)).toContain('A arquibancada está vazia')
    expect(textOf(tree)).toContain('Siga atletas para ver as fotos deles aqui, ou abra os trabalhos com a sua.')
    expect(textOf(tree)).not.toContain('Chegou ao fim')
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as never)
    await click(tree, 'Publicar foto')
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledOnce()
    // Cancelar o seletor não abre nada.
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await click(tree, 'Buscar atletas')
    expect(tab(tree, 'Atletas').props.accessibilityState.selected).toBe(true)
    expect(textOf(tree)).toContain('Encontre atletas')
    await act(async () => { tree.unmount() })
  })

  it('erro na primeira página: Feed indisponível com Tentar de novo', async () => {
    let fail = true
    serve(path => {
      if (path === '/posts' && fail) throw new Error('offline')
      return undefined
    })
    const tree = await mount()
    expect(textOf(tree)).toContain('Feed indisponível')
    // Erro de tela com o Coliseu (LoadError), no lugar do bloco antigo.
    expect(textOf(tree)).toContain('Não foi possível carregar as publicações.')
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'load-error-screen')).toHaveLength(1)
    fail = false
    await click(tree, 'Tentar novamente')
    expect(postsCalls()).toHaveLength(2)
    expect(textOf(tree)).toContain('Foto 7')
    expect(textOf(tree)).not.toContain('Feed indisponível')
    await act(async () => { tree.unmount() })
  })

  it('pagina ao chegar perto do fim, mostra o progresso e, sem cursor, o cartão Chegou ao fim', async () => {
    let release!: () => void
    serve(async path => {
      if (path === '/posts') return page([makePost(7)], 'p2')
      if (path === '/posts?cursor=p2') { await new Promise<void>(resolve => { release = resolve }); return page([makePost(6)]) }
      return undefined
    })
    const tree = await mount()
    expect(textOf(tree)).not.toContain('Chegou ao fim')
    await act(async () => { feedList(tree).props.onEndReached() })
    expect(request).toHaveBeenCalledWith('/posts?cursor=p2')
    expect(byLabel(tree, 'Carregando mais publicações')).toHaveLength(1)
    await act(async () => { feedList(tree).props.onEndReached() })
    expect(vi.mocked(request).mock.calls.filter(([path]) => path === '/posts?cursor=p2')).toHaveLength(1)
    await act(async () => { release() })
    expect(textOf(tree)).toContain('Foto 6')
    expect(textOf(tree)).toContain('Chegou ao fim')
    expect(textOf(tree)).toContain('Que tal compartilhar a sua?')
    expect(button(tree, 'Publicar')).toBeTruthy()
    await act(async () => { tree.unmount() })
  })

  it('erro ao carregar mais mostra a mensagem e deixa tentar de novo', async () => {
    let fail = true
    serve(path => {
      if (path === '/posts') return page([makePost(7)], 'p2')
      if (path === '/posts?cursor=p2') { if (fail) throw new Error('Sem conexão.'); return page([makePost(6)]) }
      return undefined
    })
    const tree = await mount()
    await act(async () => { feedList(tree).props.onEndReached() })
    expect(textOf(tree)).toContain('Sem conexão.')
    // Com erro, chegar ao fim não dispara de novo sozinho.
    await act(async () => { feedList(tree).props.onEndReached() })
    expect(vi.mocked(request).mock.calls.filter(([path]) => path === '/posts?cursor=p2')).toHaveLength(1)
    fail = false
    await click(tree, 'Carregar mais publicações')
    expect(textOf(tree)).toContain('Foto 6')
    await act(async () => { tree.unmount() })
  })
})

describe('Comunidade: aba Atletas', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('antes de buscar mostra quem você segue e a dica; tocar no avatar abre o perfil', async () => {
    serve(path => {
      if (path === '/users/1/following') return page([{ user: person(5, { name: 'Ana Lima' }) }, { user: person(6, { name: 'Bia Souza' }) }])
      if (path === '/users/5') return person(5, { name: 'Ana Lima' })
      if (path.startsWith('/users/5/mutual-followers')) return { items: [], total: 0, next_cursor: null }
      return undefined
    })
    const tree = await mount()
    expect(request).not.toHaveBeenCalledWith('/users/1/following')
    await press(tree, 'Atletas')
    expect(request).toHaveBeenCalledWith('/users/1/following')
    expect(textOf(tree)).toContain('Quem você segue · 2')
    expect(textOf(tree)).toContain('Ana')
    expect(textOf(tree)).toContain('Bia')
    expect(textOf(tree)).toContain('Encontre atletas')
    expect(textOf(tree)).toContain('Busque pelo nome ou pelo @ no campo acima. Contas privadas recebem um pedido para seguir.')
    await press(tree, 'Abrir perfil de Ana Lima')
    expect(request).toHaveBeenCalledWith('/users/5')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('sem ninguém seguido mostra só a dica', async () => {
    serve()
    const tree = await mount()
    await press(tree, 'Atletas')
    expect(textOf(tree)).not.toContain('Quem você segue')
    expect(textOf(tree)).toContain('Encontre atletas')
    await act(async () => { tree.unmount() })
  })

  it('busca com debounce e descarta respostas de termos anteriores', async () => {
    const held: Record<string, () => void> = {}
    serve(async path => {
      if (!path.startsWith('/users?q=')) return undefined
      const term = decodeURIComponent(path.slice('/users?q='.length))
      if (term === 'ana') await new Promise<void>(resolve => { held.ana = resolve })
      return page([person(term === 'ana' ? 5 : 6, { name: term === 'ana' ? 'Ana Lima' : 'Bia Souza' })])
    })
    const tree = await mount()
    await press(tree, 'Atletas')
    vi.useFakeTimers()
    await type(tree, 'Buscar atletas por nome ou @', 'an')
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await type(tree, 'Buscar atletas por nome ou @', 'ana')
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(request).not.toHaveBeenCalledWith('/users?q=an')
    expect(byLabel(tree, 'Buscando atletas')).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(request).toHaveBeenCalledWith('/users?q=ana')
    await type(tree, 'Buscar atletas por nome ou @', 'bia')
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(textOf(tree)).toContain('Bia Souza')
    // A resposta atrasada de "ana" chega depois e é ignorada.
    await act(async () => { held.ana() })
    expect(textOf(tree)).toContain('Bia Souza')
    expect(textOf(tree)).not.toContain('Ana Lima')
    // "@" sozinho não vai ao servidor (que o rejeitaria) e volta à dica.
    await type(tree, 'Buscar atletas por nome ou @', '@')
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(request).not.toHaveBeenCalledWith('/users?q=%40')
    expect(textOf(tree)).toContain('Encontre atletas')
    await act(async () => { tree.unmount() })
  })

  it('lista pessoas com @, conta pública/privada e Segue você; Seguir, Solicitar, Solicitado e Seguindo alternam', async () => {
    serve((path, method) => {
      if (path === '/users?q=atleta') return page([athlete, person(3, { name: 'Privada', username: 'privada', social_public: false, follows_you: true })], 'next')
      if (path === '/users?q=atleta&cursor=next') return page([person(4, { name: 'Outro atleta', username: 'outro' })])
      if (path === '/users/2/follow' && method === 'PUT') return { state: 'approved' }
      if (path === '/users/3/follow' && method === 'PUT') return { state: 'pending' }
      return undefined
    })
    const tree = await mount()
    await searchAthletes(tree, 'atleta')
    expect(textOf(tree)).toContain('@atleta.a · Conta pública')
    expect(textOf(tree)).toContain('@privada · Conta privada')
    expect(textOf(tree).match(/Segue você/g)).toHaveLength(1)
    await press(tree, 'Seguir: @atleta.a')
    expect(request).toHaveBeenCalledWith('/users/2/follow', 'PUT')
    expect(byLabel(tree, 'Seguindo: @atleta.a')).toHaveLength(1)
    await press(tree, 'Seguindo: @atleta.a')
    expect(request).toHaveBeenCalledWith('/users/2/follow', 'DELETE')
    expect(byLabel(tree, 'Seguir: @atleta.a')).toHaveLength(1)
    await press(tree, 'Solicitar: @privada')
    expect(byLabel(tree, 'Solicitado: @privada')).toHaveLength(1)
    await press(tree, 'Solicitado: @privada')
    expect(request).toHaveBeenCalledWith('/users/3/follow', 'DELETE')
    expect(byLabel(tree, 'Solicitar: @privada')).toHaveLength(1)
    // O seguir pela lista não abre o perfil.
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await click(tree, 'Carregar mais atletas')
    expect(request).toHaveBeenCalledWith('/users?q=atleta&cursor=next')
    expect(textOf(tree)).toContain('Outro atleta')
    expect(button(tree, 'Carregar mais atletas')).toBeUndefined()
    await act(async () => { tree.unmount() })
  })

  it('nada encontrado, erro de vínculo e sessão expirada na busca', async () => {
    const onExpired = vi.fn()
    serve((path, method) => {
      if (path === '/users?q=zzz') return page([])
      if (path === '/users?q=atleta') return page([athlete])
      if (path === '/users/2/follow' && method === 'PUT') throw new Error('Não foi possível seguir.')
      if (path === '/users?q=sair') throw new ApiError('Sessão expirada', 401)
      return undefined
    })
    const tree = await mount({ onExpired })
    await searchAthletes(tree, 'zzz')
    expect(textOf(tree)).toContain('Nenhum atleta encontrado')
    expect(textOf(tree)).toContain('Confira a grafia ou busque pelo @ exato.')
    await searchAthletes(tree, 'atleta')
    await press(tree, 'Seguir: @atleta.a')
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['error', 'Não foi possível seguir.']])
    expect(textOf(tree)).not.toContain('Não foi possível seguir.')
    expect(byLabel(tree, 'Seguir: @atleta.a')[0].props.disabled).toBe(false)
    await searchAthletes(tree, 'sair')
    expect(onExpired).toHaveBeenCalledOnce()
    expect(textOf(tree)).toContain('Sessão expirada')
    await act(async () => { tree.unmount() })
  })
})

describe('Comunidade: erros de carregamento e de abertura de perfil', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset(); scroller.scrollToOffset.mockReset() })

  it('a busca que falha é um erro de seção (LoadError), com "Tentar novamente" que refaz a busca', async () => {
    let fail = true
    serve(path => {
      if (path === '/users?q=falha') { if (fail) throw new ApiError('Busca fora do ar.', 500); return page([athlete]) }
      return undefined
    })
    const tree = await mount()
    await searchAthletes(tree, 'falha')
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'load-error-section')).toHaveLength(1)
    expect(textOf(tree)).toContain('Busca indisponível')
    expect(textOf(tree)).toContain('Busca fora do ar.')
    expect(toasts()).toEqual([])
    fail = false
    vi.useFakeTimers()
    try {
      await press(tree, 'Tentar novamente')
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    } finally { vi.useRealTimers() }
    expect(textOf(tree)).toContain('Atleta A')
    expect(textOf(tree)).not.toContain('Busca indisponível')
    await act(async () => { tree.unmount() })
  })

  it('o perfil que não abre vira toast de erro; a sessão expirada e a falta de conexão não', async () => {
    const onExpired = vi.fn()
    let failure: Error = new ApiError('Perfil fora do ar.', 500)
    serve(path => { if (path === '/users/2') throw failure; return undefined })
    const tree = await mount({ onExpired })
    await press(tree, 'Abrir perfil de @atleta.a')
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['error', 'Perfil fora do ar.']])
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    failure = new ApiError('Sem resposta.', 503) as Error
    Object.assign(failure, { isConnection: true })
    await press(tree, 'Abrir perfil de @atleta.a')
    failure = new ApiError('Sessão expirada', 401)
    await press(tree, 'Abrir perfil de @atleta.a')
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })
})

describe('Comunidade: nova publicação em dois passos', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset(); scroller.scrollToOffset.mockReset() })

  it('+ abre o recorte nativo 1:1; a legenda é enviada em multipart e o post entra no topo', async () => {
    let sent: FormData | null = null
    serve((path, method, body) => {
      if (path === '/posts' && method === 'POST') { sent = body as FormData; return makePost(99, { caption: 'Golaço', author: person(1, { name: 'Eu Mesmo', username: 'eu.atleta' }) }) }
      return undefined
    })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset())).mockResolvedValueOnce(picked(asset('file:///outra.jpg')))
    const tree = await mount()
    await press(tree, 'Nova publicação')
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'] }))
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    const preview = () => byLabel(tree, 'Prévia da foto recortada')[0]
    expect(preview().props.source).toEqual({ uri: 'file:///foto.jpg' })
    expect(byLabel(tree, 'Passo 2 de 2, Legenda')).toHaveLength(1)
    expect(textOf(tree)).toContain('0/2.200')
    // Tocar no passo 1 concluído reabre o seletor para trocar a foto.
    await press(tree, 'Passo 1, Recorte concluído. Trocar foto')
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2)
    expect(preview().props.source).toEqual({ uri: 'file:///outra.jpg' })
    expect(byLabel(tree, 'Legenda')[0].props.placeholder).toBe('Conte um pouco sobre esse momento')
    expect(byLabel(tree, 'Legenda')[0].props.maxLength).toBe(2200)
    await type(tree, 'Legenda', 'Golaço')
    expect(textOf(tree)).toContain('6/2.200')
    await press(tree, 'Publicar')
    expect(request).toHaveBeenCalledWith('/posts', 'POST', expect.any(FormData))
    expect(sent!.get('caption')).toBe('Golaço')
    expect(sent!.has('file')).toBe(true)
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Publicação compartilhada.']])
    const captions = textOf(tree).split(' | ').filter(text => text.includes('Golaço') || text.includes('Foto 7'))
    expect(captions[0]).toContain('Golaço')
    expect(scroller.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true })
    await act(async () => { tree.unmount() })
  })

  it('mostra "Publicando…" desabilitado durante o envio e o erro na própria tela', async () => {
    let reject!: (err: Error) => void
    serve((path, method) => path === '/posts' && method === 'POST' ? new Promise((_, fail) => { reject = fail }) : undefined)
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(asset()))
    const tree = await mount()
    await press(tree, 'Nova publicação')
    await press(tree, 'Publicar')
    const sending = byLabel(tree, 'Publicando…')[0]
    expect(sending.props.disabled).toBe(true)
    expect(textOf(tree)).toContain('Publicando…')
    await act(async () => { reject(new Error('Arquivo inválido.')) })
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    expect(textOf(tree)).toContain('Arquivo inválido.')
    await press(tree, 'Fechar nova publicação')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('recusa imagem acima de 5 MiB e trata sessão expirada ao publicar', async () => {
    const onExpired = vi.fn()
    serve((path, method) => { if (path === '/posts' && method === 'POST') throw new ApiError('Sessão expirada', 401); return undefined })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset('file:///grande.jpg', { fileSize: 6 * 1024 * 1024 }))).mockResolvedValue(picked(asset()))
    const tree = await mount({ onExpired })
    await press(tree, 'Nova publicação')
    expect(toastText()).toContain('A imagem deve ter até 5 MiB.')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await press(tree, 'Nova publicação')
    await press(tree, 'Publicar')
    expect(onExpired).toHaveBeenCalledOnce()
    await act(async () => { tree.unmount() })
  })

  it('vindo do quadro "Nova foto" do perfil, abre o seletor ao montar', async () => {
    serve()
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(asset()))
    const onComposeStarted = vi.fn()
    const tree = await mount({ composeOnOpen: true, onComposeStarted })
    expect(onComposeStarted).toHaveBeenCalledOnce()
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledOnce()
    expect(byLabel(tree, 'Prévia da foto recortada')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })
})
