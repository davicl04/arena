import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, clearToken, request } from '../src/api/client'
import CommunityScreen from '../src/screens/CommunityScreen'
import ProfileScreen from '../src/screens/ProfileScreen'
import { appVersion } from '../src/utils/appInfo'
import { searchAthletes } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-safe-area-context', async () => {
  const ReactModule = await import('react')
  return { SafeAreaView: ({ children, ...props }: Record<string, unknown>) => ReactModule.createElement('SafeAreaView', props, children as React.ReactNode) }
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
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  clearToken: vi.fn(), sports: [],
  request: vi.fn(),
}))

const me = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: true, avatar: null, cover: null }
const athlete = { id: 2, name: 'Atleta A', username: 'atleta.a', avatar_url: null, cover_url: null, social_public: true, post_count: 0,
  follower_count: 3, following_count: 2, follows_you: false, follow_state: 'none' as const }
type Tree = ReturnType<typeof create>
const baseData = (path: string) => (path === '/cities' || path === '/me/sports-profiles' ? [] : { items: [], next_cursor: null }) as never
const texts = (tree: Tree) => tree.root.findAllByType('Text' as never).map(entry => JSON.stringify(entry.props.children)).join(' ')
const pressables = (tree: Tree, label: string) => tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === label)
const titles = (tree: Tree, username: string) => tree.root.findAll(node => node.props.accessibilityRole === 'header' && node.props.accessibilityLabel === `@${username}`)
async function press(tree: Tree, label: string) {
  const targets = pressables(tree, label)
  expect(targets.length, `Pressable "${label}"`).toBeGreaterThan(0)
  await act(async () => { targets[targets.length - 1].props.onPress() })
}
async function mount(props: Partial<React.ComponentProps<typeof ProfileScreen>> = {}) {
  let tree!: Tree
  await act(async () => { tree = create(React.createElement(ProfileScreen, { user: me, onExpired: vi.fn(), onLogout: vi.fn(), onUser: vi.fn(), ...props })) })
  return tree
}

describe('menu do perfil', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(request).mockReset().mockImplementation(async path => baseData(path))
    vi.mocked(clearToken).mockClear()
  })

  it('usa @usuario como título, com o nome real abaixo, e troca a engrenagem pelo botão Menu', async () => {
    const tree = await mount()
    expect(titles(tree, 'maria.s').length).toBeGreaterThan(0)
    expect(texts(tree)).toContain('"Maria Souza"')
    expect(pressables(tree, 'Menu')).toHaveLength(1)
    expect(pressables(tree, 'Editar perfil')).toHaveLength(1)
    expect(pressables(tree, 'Configurações do app')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('abre o menu com Conta, App e Sair, sem Moderação mesmo para administradores', async () => {
    const tree = await mount()
    await press(tree, 'Menu')
    const text = texts(tree)
    for (const expected of ['"Menu"', '"CONTA"', '"APP"', '"Sair da conta"']) expect(text).toContain(expected)
    expect(pressables(tree, 'Editar perfil')).toHaveLength(2)
    expect(pressables(tree, 'Minhas modalidades')).toHaveLength(1)
    expect(pressables(tree, 'Notificações: Em breve')[0].props.onPress).toBeUndefined()
    expect(pressables(tree, `Sobre o ARENA: Versão ${appVersion}`)).toHaveLength(1)
    expect(text).not.toContain('Denúncias')
    expect(text).not.toContain('MODERAÇÃO')
    await act(async () => { tree.unmount() })
  })

  it('Editar perfil pelo menu volta ao menu; pelo selo do avatar apenas fecha', async () => {
    const tree = await mount()
    await press(tree, 'Menu')
    await press(tree, 'Editar perfil')
    expect(texts(tree)).toContain('"PRIVACIDADE"')
    expect(pressables(tree, 'Voltar')).toHaveLength(1)
    await press(tree, 'Voltar')
    expect(texts(tree)).toContain('"CONTA"')
    await press(tree, 'Fechar')
    expect(texts(tree)).not.toContain('"CONTA"')
    await press(tree, 'Editar perfil')
    expect(texts(tree)).toContain('"PRIVACIDADE"')
    expect(pressables(tree, 'Voltar')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('Minhas modalidades fecha o menu e deixa a lista de modalidades à vista', async () => {
    const tree = await mount()
    await press(tree, 'Menu')
    await press(tree, 'Minhas modalidades')
    expect(texts(tree)).not.toContain('"CONTA"')
    expect(texts(tree)).toContain('"Suas modalidades"')
    await act(async () => { tree.unmount() })
  })

  it('Sair da conta chama a API, limpa o token e fica desabilitada com "Aguarde…" durante a saída', async () => {
    let finish!: () => void
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/auth/logout' && method === 'POST') return new Promise<void>(resolve => { finish = resolve }) as never
      return baseData(path)
    })
    const onLogout = vi.fn()
    const tree = await mount({ onLogout })
    await press(tree, 'Menu')
    await press(tree, 'Sair da conta')
    expect(request).toHaveBeenCalledWith('/auth/logout', 'POST')
    expect(pressables(tree, 'Aguarde…')[0].props.disabled).toBe(true)
    expect(onLogout).not.toHaveBeenCalled()
    await act(async () => { finish() })
    expect(clearToken).toHaveBeenCalled()
    expect(onLogout).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })

  it('sem rede, a saída vale mesmo assim: apaga o token do aparelho e a conta da memória', async () => {
    vi.mocked(clearToken).mockClear()
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/auth/logout') throw new Error('Sem conexão.')
      return baseData(path)
    })
    const onLogout = vi.fn()
    const tree = await mount({ onLogout })
    await press(tree, 'Menu')
    await press(tree, 'Sair da conta')
    expect(request).toHaveBeenCalledWith('/auth/logout', 'POST')
    expect(clearToken).toHaveBeenCalledTimes(1)
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(texts(tree)).not.toContain('Sem conexão.')
    await act(async () => { tree.unmount() })
  })

  it('sessão já inválida no servidor (401 ao sair) também sai, sem expirar de novo', async () => {
    vi.mocked(clearToken).mockClear()
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/auth/logout') throw new ApiError('Sessão expirada', 401)
      return baseData(path)
    })
    const onLogout = vi.fn()
    const onExpired = vi.fn()
    const tree = await mount({ onLogout, onExpired })
    await press(tree, 'Menu')
    await press(tree, 'Sair da conta')
    expect(clearToken).toHaveBeenCalledTimes(1)
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(onExpired).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('se o aparelho não consegue apagar o token, mostra o erro, não sai e reabilita Sair', async () => {
    vi.mocked(clearToken).mockRejectedValueOnce(new Error('Armazenamento seguro indisponível.'))
    vi.mocked(request).mockImplementation(async path => baseData(path))
    const onLogout = vi.fn()
    const tree = await mount({ onLogout })
    await press(tree, 'Menu')
    await press(tree, 'Sair da conta')
    expect(texts(tree)).toContain('Armazenamento seguro indisponível.')
    expect(pressables(tree, 'Sair da conta')[0].props.disabled).toBe(false)
    expect(onLogout).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('o perfil de visitante também mostra @usuario como título e o nome real abaixo', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path.startsWith('/users?q=')) return { items: [athlete], next_cursor: null } as never
      if (path === '/users/2') return athlete as never
      return baseData(path)
    })
    let tree!: Tree
    await act(async () => { tree = create(React.createElement(CommunityScreen, { user: me, onExpired: vi.fn() })) })
    await searchAthletes(tree, 'atleta')
    await press(tree, 'Abrir perfil de Atleta A')
    expect(titles(tree, 'atleta.a').length).toBeGreaterThan(0)
    expect(texts(tree)).toContain('Perfil público')
    await act(async () => { tree.unmount() })
  })
})
