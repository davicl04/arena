import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import type { Post } from '../src/api/client'
import ProfileGallery from '../src/components/ProfileGallery'
import CommunityScreen from '../src/screens/CommunityScreen'
import ProfileScreen from '../src/screens/ProfileScreen'
import { button, byLabel, click, enableAct, press, textOf, type } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/components/SportCard', () => ({ default: () => null }))
vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  clearToken: vi.fn(), sports: [],
  request: vi.fn(),
}))

const me = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const meSocial = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', avatar_url: null, cover_url: null, social_public: true, post_count: 1,
  follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self' as const }
const athlete = { ...meSocial, id: 2, name: 'Atleta A', username: 'atleta.a', follow_state: 'none' as const, post_count: 3 }
const makePost = (id: number, extra: Partial<Post> = {}): Post => ({ id, author: meSocial, caption: `Foto ${id}`, image_url: `/posts/${id}/image`,
  created_at: '2026-10-10T10:00:00Z', like_count: id * 10, comment_count: 0, liked_by_me: false, can_edit: true, ...extra })
type Tree = ReturnType<typeof create>
const scroller = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() }
const nodeMock = (element: { type: unknown }) => element.type === 'FlatList' ? scroller : null

async function mountGallery(props: Partial<React.ComponentProps<typeof ProfileGallery>> = {}) {
  let tree!: Tree
  await act(async () => {
    tree = create(React.createElement(ProfileGallery, { userId: 1, ownerName: 'Eu Mesmo', ownerUsername: 'eu.atleta', viewerId: 1, token: 'test-token', onExpired: vi.fn(), ...props }), { createNodeMock: nodeMock })
  })
  return tree
}
const tiles = (tree: Tree) => tree.root.findAllByType('Pressable' as never).filter(entry => String(entry.props.accessibilityLabel).startsWith('Abrir publicação')).map(entry => entry.props.accessibilityLabel)
const viewerList = (tree: Tree) => tree.root.findAllByType('FlatList' as never)[0]

describe('galeria do perfil e visualizador "Publicações"', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); scroller.scrollToIndex.mockReset(); scroller.scrollToOffset.mockReset() })

  it('monta a grade 3×N, completa a última linha com "Nova foto" e carrega mais fotos', async () => {
    vi.mocked(request).mockImplementation(async path => (path.includes('cursor=')
      ? { items: [makePost(5), makePost(6)], next_cursor: null }
      : { items: [1, 2, 3, 4].map(id => makePost(id)), next_cursor: 'p2' }) as never)
    const onNewPhoto = vi.fn()
    const tree = await mountGallery({ own: true, onNewPhoto })
    expect(request).toHaveBeenCalledWith('/users/1/posts')
    expect(tiles(tree)).toEqual(['Abrir publicação: Foto 1', 'Abrir publicação: Foto 2', 'Abrir publicação: Foto 3', 'Abrir publicação: Foto 4'])
    // Duas linhas de três: quatro fotos, "Nova foto" e um espaço vazio.
    expect(byLabel(tree, 'Fotos de Eu Mesmo')[0].children).toHaveLength(2)
    await press(tree, 'Nova foto')
    expect(onNewPhoto).toHaveBeenCalledOnce()
    await click(tree, 'Carregar mais fotos')
    expect(request).toHaveBeenCalledWith('/users/1/posts?cursor=p2')
    expect(tiles(tree)).toHaveLength(6)
    expect(byLabel(tree, 'Nova foto')).toHaveLength(0)
    expect(button(tree, 'Carregar mais fotos')).toBeUndefined()
    await act(async () => { tree.unmount() })
  })

  it('abre no post tocado e reflete curtidas e legendas na grade', async () => {
    vi.mocked(request).mockImplementation(async (path, method, body) => {
      if (method === 'PATCH') return makePost(2, { caption: (body as { caption: string }).caption }) as never
      if (method) return undefined as never
      return { items: [1, 2, 3].map(id => makePost(id)), next_cursor: null } as never
    })
    const tree = await mountGallery({ own: true, onNewPhoto: vi.fn() })
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await press(tree, 'Abrir publicação: Foto 3')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    expect(textOf(tree)).toContain('Publicações')
    expect(textOf(tree)).toContain('@EU.ATLETA')
    expect(viewerList(tree).props.initialScrollIndex).toBe(2)
    // Sem altura fixa por item, a falha de rolagem cai na aproximação e tenta de novo.
    await act(async () => { viewerList(tree).props.onScrollToIndexFailed({ index: 2, averageItemLength: 480, highestMeasuredFrameIndex: 0 }) })
    expect(scroller.scrollToOffset).toHaveBeenCalledWith({ offset: 960, animated: false })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
    expect(scroller.scrollToIndex).toHaveBeenCalledWith({ index: 2, animated: false })

    await press(tree, 'Curtir, 30 curtidas')
    expect(request).toHaveBeenCalledWith('/posts/3/like', 'PUT')
    expect(byLabel(tree, 'Curtir, 31 curtidas')[0].props.accessibilityState.checked).toBe(true)

    const actions = tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === 'Ações da publicação')
    await act(async () => { actions[1].props.onPress() })
    await press(tree, 'Editar legenda')
    await type(tree, 'Legenda', 'Final do torneio')
    await click(tree, 'Salvar')
    expect(request).toHaveBeenCalledWith('/posts/2', 'PATCH', { caption: 'Final do torneio' })
    expect(tiles(tree)).toContain('Abrir publicação: Final do torneio')

    await act(async () => { viewerList(tree).props.onEndReached() })
    expect(vi.mocked(request).mock.calls.filter(([path]) => String(path).includes('cursor='))).toHaveLength(0)
    await press(tree, 'Voltar')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('visitante não vê "Nova foto" e o visualizador carrega mais ao chegar ao fim', async () => {
    vi.mocked(request).mockImplementation(async path => (String(path).endsWith('cursor=p3')
      ? { items: [makePost(10, { author: athlete, can_edit: false })], next_cursor: null }
      : String(path).includes('cursor=')
      ? { items: [makePost(9, { author: athlete, can_edit: false })], next_cursor: 'p3' }
      : { items: [makePost(8, { author: athlete, can_edit: false })], next_cursor: 'p2' }) as never)
    const onNewPhoto = vi.fn()
    const tree = await mountGallery({ userId: 2, ownerName: 'Atleta A', ownerUsername: 'atleta.a', onNewPhoto })
    expect(byLabel(tree, 'Nova foto')).toHaveLength(0)
    await press(tree, 'Abrir publicação: Foto 8')
    await act(async () => { viewerList(tree).props.onEndReached() })
    expect(request).toHaveBeenCalledWith('/users/2/posts?cursor=p2')
    expect(textOf(tree)).toContain('Foto 9')
    await click(tree, 'Carregar mais publicações')
    expect(request).toHaveBeenCalledWith('/users/2/posts?cursor=p3')
    expect(textOf(tree)).toContain('Foto 10')
    expect(button(tree, 'Carregar mais publicações')).toBeUndefined()
    await press(tree, 'Ações da publicação')
    expect(byLabel(tree, 'Excluir publicação')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('ao excluir o último post o visualizador fecha e a grade mostra o estado vazio', async () => {
    vi.mocked(request).mockImplementation(async (_path, method) => (method ? undefined : { items: [makePost(4)], next_cursor: null }) as never)
    const onNewPhoto = vi.fn()
    const onPostRemove = vi.fn()
    const tree = await mountGallery({ own: true, onNewPhoto, onPostRemove })
    await press(tree, 'Abrir publicação: Foto 4')
    await press(tree, 'Ações da publicação')
    await press(tree, 'Excluir publicação')
    await click(tree, 'Excluir')
    expect(request).toHaveBeenCalledWith('/posts/4', 'DELETE')
    expect(onPostRemove).toHaveBeenCalledWith(4)
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    expect(textOf(tree)).toContain('Nenhuma foto por aqui')
    await click(tree, 'Publicar foto')
    expect(onNewPhoto).toHaveBeenCalledOnce()
    await act(async () => { tree.unmount() })
  })

  it('mostra carregando, erro com nova tentativa e vazio de visitante', async () => {
    let fail = true
    let resolve!: () => void
    vi.mocked(request).mockImplementation(async () => {
      await new Promise<void>(done => { resolve = done })
      if (fail) throw new Error('Fotos indisponíveis.')
      return { items: [], next_cursor: null } as never
    })
    const tree = await mountGallery({ userId: 2, ownerName: 'Atleta A', ownerUsername: 'atleta.a' })
    expect(byLabel(tree, 'Carregando fotos')).toHaveLength(1)
    await act(async () => { resolve() })
    expect(textOf(tree)).toContain('Fotos indisponíveis.')
    fail = false
    await click(tree, 'Tentar novamente')
    await act(async () => { resolve() })
    expect(textOf(tree)).toContain('Esta conta ainda não publicou fotos.')
    expect(button(tree, 'Publicar foto')).toBeUndefined()
    await act(async () => { tree.unmount() })
  })
})

describe('telas com abas, topo fixo e ações da conta', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset() })

  it('perfil próprio: abas Fotos | Partidas, galeria própria e topo que condensa após a capa', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/cities' || path === '/me/sports-profiles') return [] as never
      if (path === '/users/1') return meSocial as never
      if (path === '/users/1/posts') return { items: [makePost(1)], next_cursor: null } as never
      return { items: [], next_cursor: null } as never
    })
    const onNewPhoto = vi.fn()
    let tree!: Tree
    await act(async () => { tree = create(React.createElement(ProfileScreen, { user: me, onExpired: vi.fn(), onLogout: vi.fn(), onUser: vi.fn(), onNewPhoto })) })
    const tabs = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'tab' && ['Fotos', 'Partidas'].includes(node.props.accessibilityLabel))
    expect(tabs.map(tab => [tab.props.accessibilityLabel, tab.props.accessibilityState.selected])).toEqual([['Fotos', true], ['Partidas', false]])
    expect(tiles(tree)).toEqual(['Abrir publicação: Foto 1'])
    await press(tree, 'Nova foto')
    expect(onNewPhoto).toHaveBeenCalledOnce()
    await press(tree, 'Partidas')
    expect(textOf(tree)).toContain('Sua história em campo')
    expect(tiles(tree)).toHaveLength(0)

    const scroll = tree.root.findAllByType('ScrollView' as never)[0]
    const bar = () => tree.root.findAll(node => String(node.type) === 'View' && node.props.pointerEvents === 'box-none')[0]
    // A barra condensada ganha o título @usuário; sobre a capa ela só tem os botões.
    const barTitle = () => bar().findAll(node => String(node.type) === 'Text' && node.props.accessibilityRole === 'header')
    expect(barTitle()).toHaveLength(0)
    await act(async () => { scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 200 } } }) })
    expect(barTitle()).toHaveLength(1)
    expect(textOf(tree)).toContain('@ | eu.atleta')
    expect(byLabel(tree, 'Menu')).toHaveLength(1)
    await act(async () => { scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 10 } } }) })
    expect(barTitle()).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('Comunidade: perfil visitado com topo, abas, grade e bloqueio pelo vidro de conta', async () => {
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method) return undefined as never
      if (path === '/posts') return { items: [makePost(7, { author: athlete, can_edit: false })], next_cursor: null } as never
      if (path === '/users/2') return athlete as never
      if (path.startsWith('/users/2/mutual-followers')) return { items: [], total: 0, next_cursor: null } as never
      if (path === '/users/2/posts') return { items: [makePost(7, { author: athlete, can_edit: false })], next_cursor: null } as never
      return { items: [], next_cursor: null } as never
    })
    let tree!: Tree
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: me, onExpired: vi.fn() })) })
    await press(tree, 'Abrir perfil de @atleta.a')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    expect(byLabel(tree, 'Voltar')).toHaveLength(1)
    expect(request).toHaveBeenCalledWith('/users/2/posts')
    expect(tiles(tree)).toEqual(['Abrir publicação: Foto 7'])
    expect(button(tree, 'Bloquear conta')).toBeUndefined()

    await press(tree, 'Ações da conta')
    expect(textOf(tree)).toContain('@atleta.a')
    await press(tree, 'Bloquear')
    expect(textOf(tree)).toContain('Bloquear @atleta.a?')
    await click(tree, 'Cancelar')
    await press(tree, 'Bloquear')
    await click(tree, 'Confirmar bloqueio')
    expect(request).toHaveBeenCalledWith('/users/2/block', 'PUT')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    expect(vi.mocked(request).mock.calls.filter(([path]) => path === '/posts')).toHaveLength(2)

    await press(tree, 'Abrir perfil de @atleta.a')
    await press(tree, 'Ações da conta')
    await press(tree, 'Denunciar conta')
    expect(textOf(tree)).toContain('Por que você quer denunciar esta conta?')
    await press(tree, 'Outro motivo')
    await click(tree, 'Enviar denúncia')
    expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'user', target_id: 2, reason: 'outro' })
    await click(tree, 'Concluir')
    expect(textOf(tree)).not.toContain('Denúncia da conta enviada.')
    await press(tree, 'Voltar')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('Comunidade: comentários e exclusões feitos na grade do perfil refletem no feed e na contagem', async () => {
    const mine = makePost(7, { comment_count: 0 })
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts/7/comments' && method === 'POST') return { id: 3, author_id: 1, author_name: 'Eu Mesmo', author_avatar_url: null, body: 'Valeu', created_at: mine.created_at, can_delete: true } as never
      if (method) return undefined as never
      if (path === '/posts' || path === '/users/1/posts') return { items: [mine], next_cursor: null } as never
      if (path === '/users/1') return meSocial as never
      return { items: [], next_cursor: null } as never
    })
    let tree!: Tree
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: me, onExpired: vi.fn() }), { createNodeMock: nodeMock }) })
    await press(tree, 'Abrir perfil de @eu.atleta')
    expect(byLabel(tree, 'Ações da conta')).toHaveLength(0)
    expect(byLabel(tree, 'Nova foto')).toHaveLength(0)
    expect(textOf(tree)).toContain('1 publicações')
    await press(tree, 'Abrir publicação: Foto 7')
    await press(tree, 'Comentários, 0')
    await type(tree, 'Escreva um comentário', 'Valeu')
    await press(tree, 'Enviar comentário')
    // O feed (fora do modal) e o visualizador mostram a mesma contagem.
    expect(byLabel(tree, 'Comentários, 1')).toHaveLength(2)
    await press(tree, 'Fechar comentários')
    const actions = tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === 'Ações da publicação')
    await act(async () => { actions[actions.length - 1].props.onPress() })
    await press(tree, 'Excluir publicação')
    await click(tree, 'Excluir')
    expect(request).toHaveBeenCalledWith('/posts/7', 'DELETE')
    expect(byLabel(tree, 'Ações da publicação')).toHaveLength(0)
    expect(textOf(tree)).toContain('0 publicações')
    expect(textOf(tree)).toContain('A arquibancada está vazia')
    await act(async () => { tree.unmount() })
  })
})
