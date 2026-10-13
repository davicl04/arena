import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import CommunityScreen from '../src/screens/CommunityScreen'
import ProfileScreen from '../src/screens/ProfileScreen'
import { searchAthletes, textOf as textsOf } from './support/native'
import { toastText } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())

vi.mock('react-native-safe-area-context', async () => {
  const ReactModule = await import('react')
  return { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }), SafeAreaView: ({ children, ...props }: Record<string, unknown>) => ReactModule.createElement('SafeAreaView', props, children as React.ReactNode) }
})
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn(), ImagePickerResult: undefined }))
vi.mock('../src/components/SportCard', () => ({ default: () => null }))
vi.mock('../src/components/ui', async () => {
  const ReactModule = await import('react')
  return {
    Button: ({ title, ...props }: Record<string, unknown>) => ReactModule.createElement('Button', { ...props, title }, title as React.ReactNode),
    Field: ({ label, ...props }: Record<string, unknown>) => ReactModule.createElement('TextInput', { ...props, accessibilityLabel: label }),
  }
})
vi.mock('../src/api/client', () => ({
  positions: [],
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  clearToken: vi.fn(), sports: [],
  request: vi.fn(),
}))

const athlete = { id: 2, name: 'Atleta A', username: 'atleta.a', avatar_url: null, cover_url: null, social_public: true, post_count: 1,
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
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: { id: 1, name: 'Eu', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }, onExpired: vi.fn() })); await Promise.resolve() })
    expect(textsOf(tree)).toContain('Treino do dia')
    const pressable = (label: string) => tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)
    const like = pressable('Curtir, 2 curtidas')
    expect(like).toBeTruthy()
    await act(async () => { like?.props.onPress(); await Promise.resolve() })
    expect(request).toHaveBeenCalledWith('/posts/7/like', 'PUT')
    expect(pressable('Curtir, 3 curtidas')?.props.accessibilityState.checked).toBe(true)
    const comments = pressable('Comentários, 0')
    await act(async () => { comments?.props.onPress(); await Promise.resolve() })
    const input = tree.root.findAllByType('TextInput' as never).find(field => field.props.accessibilityLabel === 'Escreva um comentário')
    expect(input).toBeTruthy()
    await act(async () => { input?.props.onChangeText('Boa!') })
    const submit = pressable('Enviar comentário')
    await act(async () => { submit?.props.onPress(); await Promise.resolve() })
    expect(request).toHaveBeenCalledWith('/posts/7/comments', 'POST', { body: 'Boa!' })
    expect(pressable('Comentários, 1')).toBeTruthy()
  })

  it('pagina busca, galeria e comentários usando cursores independentes', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(request).mockImplementation(async path => {
      if (path.startsWith('/users?q=')) return { items: [{ ...athlete, id: path.includes('cursor=') ? 3 : 2, name: path.includes('cursor=') ? 'Outro atleta' : 'Atleta A' }], next_cursor: path.includes('cursor=') ? null : 'people-next' } as never
      if (path === '/users/2') return athlete as never
      if (path.startsWith('/users/1/following')) return { items: [], next_cursor: null } as never
      if (path.startsWith('/users/2/posts')) return { items: [path.includes('cursor=') ? { ...post, id: 8, caption: 'Foto antiga' } : post], next_cursor: path.includes('cursor=') ? null : 'gallery-next' } as never
      if (path.startsWith('/posts/7/comments')) return { items: [{ id: path.includes('cursor=') ? 12 : 11, author_id: 2, author_name: 'Atleta A', author_avatar_url: null, body: path.includes('cursor=') ? 'Comentário antigo' : 'Recente', created_at: post.created_at, can_delete: false }], next_cursor: path.includes('cursor=') ? null : 'comments-next' } as never
      return { items: [post], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: { id: 1, name: 'Eu', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }, onExpired: vi.fn() })) })
    const click = async (title: string) => {
      const button = tree.root.findAllByType('Button' as never).find(button => button.props.title === title)
      expect(button).toBeTruthy()
      await act(async () => { button!.props.onPress() })
    }
    const pressLabel = async (label: string) => {
      const target = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)
      expect(target, label).toBeTruthy()
      await act(async () => { target!.props.onPress() })
    }
    await pressLabel('Comentários, 0')
    await pressLabel('Carregar mais comentários')
    expect(request).toHaveBeenCalledWith('/posts/7/comments?cursor=comments-next')
    await searchAthletes(tree, 'Atleta')
    await click('Carregar mais atletas')
    expect(request).toHaveBeenCalledWith('/users?q=Atleta&cursor=people-next')
    await pressLabel('Abrir perfil de Atleta A')
    await click('Carregar mais fotos')
    expect(request).toHaveBeenCalledWith('/users/2/posts?cursor=gallery-next')
    await act(async () => { tree.unmount() })
  })

  it.each(['blocks', 'followers', 'following'] as const)('pagina %s no perfil sem perder itens carregados', async which => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const paths = { blocks: '/me/blocks', followers: '/users/1/followers', following: '/users/1/following' }
    const labels = { blocks: 'contas bloqueadas', followers: 'seguidores', following: 'contas seguidas' }
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
    await act(async () => { tree = create(React.createElement(ProfileScreen, { user: { id: 1, name: 'Eu', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }, onExpired: vi.fn(), onLogout: vi.fn(), onUser: vi.fn() })) })
    {
      const trigger = tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel).startsWith(which === 'blocks' ? 'Editar perfil' : 'Conexões'))
      await act(async () => { trigger!.props.onPress() })
      if (which === 'blocks') {
        const row = tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel).startsWith('Contas bloqueadas'))
        await act(async () => { row!.props.onPress() })
      }
      if (which === 'following') {
        const tab = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityRole === 'tab' && !entry.props.accessibilityState.selected && entry.findAllByType('Text' as never).some(text => String(text.props.children).startsWith('Seguindo')))
        await act(async () => { tab!.props.onPress() })
      }
    }
    const button = tree.root.findAllByType('Button' as never).find(button => button.props.title === `Carregar mais ${labels[which]}`)
    expect(button).toBeTruthy()
    await act(async () => { button!.props.onPress() })
    expect(request).toHaveBeenCalledWith(`${paths[which]}?cursor=next-page`)
    const text = tree.root.findAllByType('Text' as never).map(entry => JSON.stringify(entry.props.children)).join(' ')
    expect(text).toContain('Outra conta')
    expect(text).toContain('Atleta A')
    await act(async () => { tree.unmount() })
  })

  const press = async (tree: ReturnType<typeof create>, type: 'Button' | 'Pressable', match: (props: Record<string, any>) => boolean) => {
    const target = tree.root.findAllByType(type as never).find(entry => match(entry.props))
    expect(target).toBeTruthy()
    await act(async () => { target!.props.onPress() })
  }
  const textOf = (tree: ReturnType<typeof create>) => tree.root.findAllByType('Text' as never).map(entry => JSON.stringify(entry.props.children)).join(' ')
  const me = { id: 1, name: 'Eu', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }

  /** Monta o perfil com `total` pedidos pendentes no servidor; tornar a conta pública os aprova todos. */
  async function mountFollowRequests(total: number) {
    let pending = Array.from({ length: total }, (_, index) => ({ ...athlete, id: index + 2, name: `Pessoa ${index + 2}` }))
    let approved: typeof pending = []
    const page = (people: typeof pending, cursor?: string) => {
      const offset = Number(cursor ?? 0)
      return { items: people.slice(offset, offset + 20).map(user => ({ user })), next_cursor: people.length > offset + 20 ? String(offset + 20) : null }
    }
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/cities' || path === '/me/sports-profiles') return [] as never
      if (path === '/users/1') return { ...athlete, id: 1, follower_count: approved.length, following_count: 0 } as never
      if (path.startsWith('/users/1/followers')) return page(approved, path.split('cursor=')[1]) as never
      if (path === '/me/privacy' && method === 'PUT') {
        approved = [...pending, ...approved]; pending = []
        return { social_public: true } as never
      }
      return { items: [], next_cursor: null } as never
    })
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const onUser = vi.fn()
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(ProfileScreen, { user: me, onExpired: vi.fn(), onLogout: vi.fn(), onUser })) })
    return { tree, onUser, pending: () => pending, approved: () => approved }
  }

  const expectFollowerCount = (tree: ReturnType<typeof create>, count: number) => {
    expect(tree.root.findAllByType('Pressable' as never).some(entry => entry.props.accessibilityLabel === `Conexões: ${count} ${count === 1 ? 'seguidor' : 'seguidores'} · 0 seguindo`)).toBe(true)
  }

  it('o perfil não tem mais o cartão interno "Notificações" nem lê os pedidos para seguir', async () => {
    const { tree } = await mountFollowRequests(3)
    expect(textOf(tree)).not.toContain('Solicitações para seguir')
    expect(textOf(tree)).not.toContain('Nenhuma notificação por enquanto.')
    expect(tree.root.findAllByType('Button' as never).some(entry => entry.props.title === 'Aprovar todas')).toBe(false)
    expect(tree.root.findAllByType('Pressable' as never).some(entry => String(entry.props.accessibilityLabel).startsWith('Aprovar '))).toBe(false)
    expect(vi.mocked(request).mock.calls.filter(([path]) => String(path).startsWith('/me/follow-requests'))).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('sincroniza 45 seguidores aprovados automaticamente ao tornar a conta pública', async () => {
    const { tree, onUser, pending } = await mountFollowRequests(45)
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Editar perfil')
    await press(tree, 'Pressable', props => String(props.accessibilityLabel).startsWith('Visibilidade da conta'))
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Pública')
    await press(tree, 'Button', props => props.title === 'Salvar visibilidade')
    expect(onUser).toHaveBeenCalledWith(expect.objectContaining({ social_public: true }))
    expect(pending()).toHaveLength(0)
    expectFollowerCount(tree, 45)
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Fechar')
    await press(tree, 'Pressable', props => String(props.accessibilityLabel).startsWith('Conexões:'))
    expect(textOf(tree)).toContain('Pessoa 2')
    await press(tree, 'Button', props => props.title === 'Carregar mais seguidores')
    expect(textOf(tree)).toContain('Pessoa 22')
    await act(async () => { tree.unmount() })
  })

  it('trata expiração ao reler as contagens depois de salvar a visibilidade', async () => {
    const { tree } = await mountFollowRequests(1)
    const serve = vi.mocked(request).getMockImplementation()!
    const expired = vi.fn()
    await act(async () => { tree.update(React.createElement(ProfileScreen, { user: me, onExpired: expired, onLogout: vi.fn(), onUser: vi.fn() })) })
    vi.mocked(request).mockImplementation(async (...args) => {
      if (args[0] === '/users/1') throw new ApiError('Sessão expirada', 401)
      return serve(...args)
    })
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Editar perfil')
    await press(tree, 'Pressable', props => String(props.accessibilityLabel).startsWith('Visibilidade da conta'))
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Pública')
    await press(tree, 'Button', props => props.title === 'Salvar visibilidade')
    expect(expired).toHaveBeenCalledOnce()
    // Sessão expirada vai ao fluxo de login, sem toast.
    expect(toastText()).not.toContain('Sessão expirada')
    await act(async () => { tree.unmount() })
  })

  it('mostra @, contagens e seguidores em comum; conta privada não seguida fica bloqueada', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const priv = { ...athlete, social_public: false, post_count: 0, follower_count: 9, following_count: 4, cover_url: '/api/v1/users/2/cover?v=1' }
    vi.mocked(request).mockImplementation(async path => {
      if (path.startsWith('/users?q=')) return { items: [priv], next_cursor: null } as never
      if (path === '/users/2') return priv as never
      if (path === '/users/2/mutual-followers?limit=2') return { items: [{ ...athlete, id: 5, name: 'Ana' }, { ...athlete, id: 6, name: 'Bia' }], total: 5, next_cursor: null } as never
      return { items: [], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: me, onExpired: vi.fn() })) })
    await searchAthletes(tree, '@atleta')
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Abrir perfil de Atleta A')
    const text = textOf(tree)
    expect(text).toContain('Ana, Bia e mais 3 que você segue também seguem esta conta.')
    expect(text).toContain('9 seguidores · 4 seguindo')
    expect(text).toContain('Esta conta é privada')
    expect(request).not.toHaveBeenCalledWith('/users/2/posts')
    await act(async () => { tree.unmount() })
  })

  it('mantém o perfil visível quando os seguidores em comum falham', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(request).mockImplementation(async path => {
      if (path.startsWith('/users?q=')) return { items: [athlete], next_cursor: null } as never
      if (path === '/users/2') return athlete as never
      if (path.includes('mutual-followers')) throw new Error('indisponível')
      return { items: [], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: me, onExpired: vi.fn() })) })
    await searchAthletes(tree, 'atleta')
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Abrir perfil de Atleta A')
    expect(textOf(tree)).toContain('3 seguidores · 2 seguindo')
    await act(async () => { tree.unmount() })
  })

  it('verifica o @ com debounce, trata 409 e salva a visibilidade e a capa', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    const onUser = vi.fn()
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/me/sports-profiles' || path === '/cities') return [] as never
      if (path === '/users/1') return athlete as never
      if (path.startsWith('/me/username-availability')) return { available: false, reason: 'taken', suggestions: ['novo.nome2'] } as never
      if (path === '/me' && method === 'PATCH') throw new ApiError('Este nome de usuário já está em uso.', 409)
      if (path === '/me/privacy') return { social_public: true } as never
      if (path === '/me/cover' && method === 'DELETE') return undefined as never
      return { items: [], next_cursor: null } as never
    })
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(React.createElement(ProfileScreen, { user: { ...me, cover: { id: 'c', url: '/api/v1/me/cover?v=c' } }, onExpired: vi.fn(), onLogout: vi.fn(), onUser })) })
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Editar perfil')
    await press(tree, 'Pressable', props => String(props.accessibilityLabel).startsWith('Nome de usuário'))
    const field = () => tree.root.findAllByType('TextInput' as never).find(input => input.props.accessibilityLabel === 'Nome de usuário')!
    await act(async () => { field().props.onChangeText('Novo.Nome') })
    expect(request).not.toHaveBeenCalledWith('/me/username-availability?u=novo.nome')
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(request).toHaveBeenCalledWith('/me/username-availability?u=novo.nome')
    expect(textOf(tree)).toContain('já está em uso')
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Usar novo.nome2')
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    await act(async () => { field().props.onChangeText('ab') })
    expect(textOf(tree)).toContain('pelo menos 3')
    vi.useRealTimers()
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Voltar')
    await press(tree, 'Pressable', props => String(props.accessibilityLabel).startsWith('Visibilidade da conta'))
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Pública')
    expect(textOf(tree)).toContain('solicitações pendentes serão aprovadas')
    await press(tree, 'Button', props => props.title === 'Salvar visibilidade')
    expect(request).toHaveBeenCalledWith('/me/privacy', 'PUT', { social_public: true })
    expect(onUser).toHaveBeenCalledWith(expect.objectContaining({ social_public: true }))
    await press(tree, 'Pressable', props => props.accessibilityLabel === 'Voltar')
    await press(tree, 'Pressable', props => String(props.accessibilityLabel).startsWith('Foto de capa'))
    await press(tree, 'Button', props => props.title === 'Voltar à capa padrão')
    expect(request).toHaveBeenCalledWith('/me/cover', 'DELETE')
    expect(onUser).toHaveBeenCalledWith(expect.objectContaining({ cover: null }))
    await act(async () => { tree.unmount() })
  })
})
