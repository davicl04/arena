import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { SocialUser } from '../src/api/client'
import UserProfileScreen from '../src/screens/UserProfileScreen'
import { button, byLabel, click, enableAct, press, textOf } from './support/native'
import { fakeNavigation, me } from './support/teams'
import type { FakeNavigation, Handler } from './support/teams'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  request: vi.fn(),
}))

const h = React.createElement
const person = (extra: Partial<SocialUser> = {}): SocialUser => ({ id: 5, name: 'Ana Lima', username: 'ana.lima', avatar_url: null, cover_url: null, social_public: true,
  post_count: 0, follower_count: 3, following_count: 2, follows_you: false, follow_state: 'none', ...extra })

let navigation: FakeNavigation
const onExpired = vi.fn()

/** Perfil de Ana (id 5), seguidores em comum vazios e galeria vazia; `extra` sobrepõe. */
function serve(extra: Handler = () => undefined) {
  vi.mocked(request).mockImplementation(async (path: string, method?: string, body?: unknown) => {
    const custom = await extra(path, method, body)
    if (custom !== undefined) return custom as never
    if (path === '/users/5') return person() as never
    if (path.startsWith('/users/5/mutual-followers')) return { items: [], total: 0, next_cursor: null } as never
    return { items: [], next_cursor: null } as never
  })
}
async function mount(userId = 5) {
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(h(UserProfileScreen, { user: me, navigation: navigation as never, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: { userId }, title: 'Perfil' })) })
  return tree
}

describe('Perfil de outro atleta (user-profile)', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); navigation = fakeNavigation(); onExpired.mockReset() })

  it('carrega o perfil do atleta pedido, sem Modal, e o ‹ volta para a tela de origem', async () => {
    serve(path => path === '/users/5/mutual-followers?limit=2' ? { items: [person({ id: 8, name: 'Beto Dias', username: 'beto' })], total: 1, next_cursor: null } : undefined)
    const tree = await mount()
    expect(request).toHaveBeenCalledWith('/users/5')
    expect(textOf(tree)).toContain('Ana Lima')
    expect(textOf(tree)).toContain('Perfil público')
    expect(textOf(tree)).toContain('Beto Dias')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await press(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    await act(async () => { tree.unmount() })
  })

  it('enquanto carrega, mostra o cabeçalho claro com o voltar; se falhar, mostra o erro e tenta de novo', async () => {
    let fail = true
    serve(path => { if (path === '/users/5' && fail) throw new Error('Perfil indisponível.'); return undefined })
    const tree = await mount()
    expect(textOf(tree)).toContain('Perfil indisponível.')
    expect(byLabel(tree, 'Voltar')).toHaveLength(1)
    await press(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    fail = false
    await click(tree, 'Tentar novamente')
    expect(textOf(tree)).toContain('Ana Lima')
    expect(textOf(tree)).not.toContain('Perfil indisponível.')
    await act(async () => { tree.unmount() })
  })

  it('sessão expirada ao carregar chama onExpired', async () => {
    serve(path => { if (path === '/users/5') throw new ApiError('Sessão expirada', 401); return undefined })
    const tree = await mount()
    expect(onExpired).toHaveBeenCalledOnce()
    expect(textOf(tree)).toContain('Sessão expirada')
    await act(async () => { tree.unmount() })
  })

  it('segue a conta pública (PUT) e recarrega o perfil com o vínculo novo; o erro do vínculo aparece no perfil', async () => {
    let state: SocialUser['follow_state'] = 'none'
    let failFollow = true
    serve((path, method) => {
      if (path === '/users/5') return person({ follow_state: state })
      if (path === '/users/5/follow' && method === 'PUT') { if (failFollow) throw new Error('Não foi possível seguir.'); state = 'approved'; return { state: 'approved' } }
      return undefined
    })
    const tree = await mount()
    expect(button(tree, 'Seguir')).toBeDefined()
    await click(tree, 'Seguir')
    expect(textOf(tree)).toContain('Não foi possível seguir.')
    failFollow = false
    await click(tree, 'Seguir')
    expect(request).toHaveBeenCalledWith('/users/5/follow', 'PUT')
    expect(button(tree, 'Deixar de seguir')).toBeDefined()
    expect(textOf(tree)).not.toContain('Não foi possível seguir.')
    await act(async () => { tree.unmount() })
  })

  it('conta privada sem vínculo pede acesso e esconde as publicações; sessão expirada ao seguir chama onExpired', async () => {
    serve((path, method) => {
      if (path === '/users/5') return person({ social_public: false })
      if (path === '/users/5/follow' && method === 'PUT') throw new ApiError('Sessão expirada', 401)
      return undefined
    })
    const tree = await mount()
    expect(textOf(tree)).toContain('Esta conta é privada.')
    await click(tree, 'Solicitar acesso')
    expect(onExpired).toHaveBeenCalledOnce()
    await act(async () => { tree.unmount() })
  })

  it('o perfil do próprio usuário não tem Seguir nem ações da conta', async () => {
    serve(path => path === '/users/1' ? person({ id: 1, name: 'Maria Souza', username: 'maria.s' }) : undefined)
    const tree = await mount(1)
    expect(textOf(tree)).toContain('Maria Souza')
    expect(button(tree, 'Seguir')).toBeUndefined()
    expect(byLabel(tree, 'Ações da conta')).toHaveLength(0)
    expect(request).not.toHaveBeenCalledWith('/users/1/mutual-followers?limit=2')
    await act(async () => { tree.unmount() })
  })

  it('bloquear pelas ações da conta volta para a tela de origem', async () => {
    serve((path, method) => path === '/users/5/block' && method === 'PUT' ? null : undefined)
    const tree = await mount()
    await press(tree, 'Ações da conta')
    await press(tree, 'Bloquear')
    await click(tree, 'Confirmar bloqueio')
    expect(request).toHaveBeenCalledWith('/users/5/block', 'PUT')
    expect(navigation.back).toHaveBeenCalledOnce()
    await act(async () => { tree.unmount() })
  })
})
