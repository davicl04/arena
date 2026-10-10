import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import CommunityScreen from '../src/screens/CommunityScreen'
import ProfileScreen from '../src/screens/ProfileScreen'

vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) => ReactModule.createElement(name, props, children as React.ReactNode)
  const renderComponent = (value: React.ReactNode) => ReactModule.isValidElement(value) ? value : value ? ReactModule.createElement(value as React.ElementType) : null
  const FlatList = ({ data = [], renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ...props }: Record<string, any>) => ReactModule.createElement('FlatList', props,
    renderComponent(ListHeaderComponent),
    data.length ? data.map((item: unknown, index: number) => ReactModule.createElement(ReactModule.Fragment, { key: index }, renderItem({ item }))) : renderComponent(ListEmptyComponent), renderComponent(ListFooterComponent))
  return { ActivityIndicator: element('ActivityIndicator'), Alert: { alert: vi.fn() }, FlatList, Image: element('Image'), Modal: element('Modal'), RefreshControl: element('RefreshControl'), Text: element('Text'), TextInput: element('TextInput'), View: element('View') }
})

vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn(), ImagePickerResult: undefined }))
vi.mock('../src/components/SportCard', () => ({ default: () => null }))
vi.mock('../src/components/ui', async () => {
  const ReactModule = await import('react')
  return {
    styles: {},
    Button: ({ title, ...props }: Record<string, unknown>) => ReactModule.createElement('Button', { ...props, title }, title as React.ReactNode),
    Field: ({ label, ...props }: Record<string, unknown>) => ReactModule.createElement('TextInput', { ...props, accessibilityLabel: label }),
  }
})
vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  clearToken: vi.fn(), sports: [],
  request: vi.fn(),
}))

const athlete = { id: 2, name: 'Atleta A', avatar_url: null, social_public: true, post_count: 1,
  follower_count: 3, following_count: 2, follows_you: false, follow_state: 'none' as const }
const post = { id: 7, author: athlete, caption: 'Treino do dia', image_url: '/post.webp',
  created_at: '2026-10-10T10:00:00Z', like_count: 2, comment_count: 0, liked_by_me: false, can_edit: false }

describe('CommunityScreen', () => {
  beforeEach(() => { vi.mocked(request).mockReset() })

  it('carrega publicações, curte e permite comentar', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts') return { items: [post], next_cursor: null } as never
      if (path === '/posts/7/like') return undefined as never
      if (path === '/posts/7/comments' && method === 'POST') return { id: 9, author_id: 1, author_name: 'Eu', author_avatar_url: null,
        body: 'Boa!', created_at: '2026-10-10T10:01:00Z', can_delete: true } as never
      if (path === '/posts/7/comments') return { items: [], next_cursor: null } as never
      return { items: [], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: { id: 1, name: 'Eu', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null }, onExpired: vi.fn() })); await Promise.resolve() })
    expect(tree.root.findAllByType('Text' as never).some(text => JSON.stringify(text.props.children).includes('Treino do dia'))).toBe(true)
    const like = tree.root.findAllByType('Button' as never).find(button => String(button.props.title).includes('Curtir · 2'))
    expect(like).toBeTruthy()
    await act(async () => { like?.props.onPress(); await Promise.resolve() })
    expect(request).toHaveBeenCalledWith('/posts/7/like', 'PUT')
    const comments = tree.root.findAllByType('Button' as never).find(button => String(button.props.title).includes('Comentários · 0'))
    await act(async () => { comments?.props.onPress(); await Promise.resolve() })
    const input = tree.root.findAllByType('TextInput' as never).find(field => field.props.accessibilityLabel === 'Escreva um comentário')
    expect(input).toBeTruthy()
    await act(async () => { input?.props.onChangeText('Boa!') })
    const submit = tree.root.findAllByType('Button' as never).find(button => button.props.title === 'Enviar')
    await act(async () => { submit?.props.onPress(); await Promise.resolve() })
    expect(request).toHaveBeenCalledWith('/posts/7/comments', 'POST', { body: 'Boa!' })
  })

  it('pagina busca, galeria e comentários usando cursores independentes', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(request).mockImplementation(async path => {
      if (path.startsWith('/users?q=')) return { items: [{ ...athlete, id: path.includes('cursor=') ? 3 : 2, name: path.includes('cursor=') ? 'Outro atleta' : 'Atleta A' }], next_cursor: path.includes('cursor=') ? null : 'people-next' } as never
      if (path === '/users/2') return athlete as never
      if (path.startsWith('/users/2/posts')) return { items: path.includes('cursor=') ? [{ ...post, id: 8, caption: 'Foto antiga' }] : [], next_cursor: path.includes('cursor=') ? null : 'gallery-next' } as never
      if (path.startsWith('/posts/7/comments')) return { items: [{ id: path.includes('cursor=') ? 12 : 11, author_id: 2, author_name: 'Atleta A', author_avatar_url: null, body: path.includes('cursor=') ? 'Comentário antigo' : 'Recente', created_at: post.created_at, can_delete: false }], next_cursor: path.includes('cursor=') ? null : 'comments-next' } as never
      return { items: [post], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: { id: 1, name: 'Eu', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null }, onExpired: vi.fn() })) })
    const click = async (title: string) => {
      const button = tree.root.findAllByType('Button' as never).find(button => button.props.title === title)
      expect(button).toBeTruthy()
      await act(async () => { button!.props.onPress() })
    }
    await click('Comentários · 0')
    await click('Carregar mais comentários')
    expect(request).toHaveBeenCalledWith('/posts/7/comments?cursor=comments-next')
    const query = tree.root.findAllByType('TextInput' as never).find(input => input.props.accessibilityLabel === 'Nome')
    await act(async () => { query!.props.onChangeText('Atleta') })
    await click('Buscar')
    await click('Carregar mais atletas')
    expect(request).toHaveBeenCalledWith('/users?q=Atleta&cursor=people-next')
    await click('Atleta A')
    await click('Carregar mais fotos')
    expect(request).toHaveBeenCalledWith('/users/2/posts?cursor=gallery-next')
    await act(async () => { tree.unmount() })
  })

  it.each(['requests', 'blocks', 'followers', 'following'] as const)('pagina %s no perfil sem perder itens carregados', async which => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const paths = { requests: '/me/follow-requests', blocks: '/me/blocks', followers: '/users/1/followers', following: '/users/1/following' }
    const labels = { requests: 'solicitações', blocks: 'contas bloqueadas', followers: 'seguidores', following: 'contas seguidas' }
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/cities' || path === '/me/sports-profiles') return [] as never
      if (path.startsWith(paths[which])) {
        const next = path.includes('cursor=')
        const user = { ...athlete, id: next ? 3 : 2, name: next ? 'Outra conta' : 'Atleta A' }
        return { items: which === 'blocks' ? [user] : [{ user }], next_cursor: next ? null : 'next-page' } as never
      }
      return { items: [], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(ProfileScreen, { user: { id: 1, name: 'Eu', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null }, onExpired: vi.fn(), onLogout: vi.fn(), onUser: vi.fn() })) })
    const button = tree.root.findAllByType('Button' as never).find(button => button.props.title === `Carregar mais ${labels[which]}`)
    expect(button).toBeTruthy()
    await act(async () => { button!.props.onPress() })
    expect(request).toHaveBeenCalledWith(`${paths[which]}?cursor=next-page`)
    const text = tree.root.findAllByType('Text' as never).map(entry => JSON.stringify(entry.props.children)).join(' ')
    expect(text).toContain('Outra conta')
    expect(text).toContain('Atleta A')
    await act(async () => { tree.unmount() })
  })
})
