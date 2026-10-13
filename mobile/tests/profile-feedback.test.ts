import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { User } from '../src/api/client'
import { connection } from '../src/api/connection'
import ProfileScreen from '../src/screens/ProfileScreen'
import { button, byLabel, click, enableAct, press, textOf, type } from './support/native'
import { toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/components/SportCard', () => ({ default: () => null }))
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  getToken: vi.fn().mockResolvedValue('test-token'), clearToken: vi.fn(), request: vi.fn(),
}))

/*
 * Perfil próprio: o carregamento que falha é erro de seção (LoadError), as confirmações e as falhas de ação saem em toast e só
 * a recusa de campo do servidor (422 com campos) e a validação local ficam dentro da folha.
 */

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const emptyPage = { items: [], next_cursor: null }
const trees: ReactTestRenderer[] = []

let profileFailure: Error | null = null
let rename: () => unknown = () => ({ ...me, name: 'Novo Nome' })
/** Rotas do perfil: tudo vazio; `profileFailure` derruba a leitura das modalidades e `rename` responde ao `PATCH /me`. */
function serve() {
  vi.mocked(request).mockImplementation((async (path: string, method?: string) => {
    if (path === '/me/sports-profiles') { if (profileFailure) throw profileFailure; return [] }
    if (path === '/cities') return []
    if (path === '/users/1') return { id: 1, follower_count: 0, following_count: 0 }
    if (path === '/me' && method === 'PATCH') return rename()
    return emptyPage
  }) as never)
}
async function mount(onExpired = vi.fn(), onUser = vi.fn()) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(ProfileScreen, { user: me, onExpired, onLogout: vi.fn(), onUser })) })
  trees.push(tree)
  return { tree, onExpired, onUser }
}
const loadErrors = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'load-error-section')
const rowStartingWith = (tree: ReactTestRenderer, prefix: string) => tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel).startsWith(prefix))!
async function openRename(tree: ReactTestRenderer) {
  await press(tree, 'Editar perfil')
  await act(async () => { rowStartingWith(tree, 'Nome: ').props.onPress() })
}

beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); profileFailure = null; rename = () => ({ ...me, name: 'Novo Nome' }); serve() })
afterEach(async () => { for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })

describe('Perfil próprio: carregamento', () => {
  it('a falha ao carregar é um erro de seção com "Tentar novamente", sem toast, e a leitura é refeita', async () => {
    profileFailure = new ApiError('Perfis fora do ar.', 500)
    const { tree } = await mount()
    expect(loadErrors(tree)).toHaveLength(1)
    expect(textOf(tree)).toContain('Não foi possível carregar o perfil')
    expect(textOf(tree)).toContain('Perfis fora do ar.')
    expect(textOf(tree)).not.toContain('Adicione sua primeira modalidade acima.')
    expect(toasts()).toEqual([])
    profileFailure = null
    await press(tree, 'Tentar novamente')
    expect(loadErrors(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('Adicione sua primeira modalidade acima.')
  })

  it('a falha de conexão diz que está sem conexão e o perfil é relido uma vez quando ela volta', async () => {
    profileFailure = new ApiError('Sem resposta.', 503)
    const { tree } = await mount()
    expect(textOf(tree)).toContain('Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.')
    expect(textOf(tree)).not.toContain('Sem resposta.')
    profileFailure = null
    await act(async () => { connection.lost({ mutating: false }); connection.reached() })
    expect(loadErrors(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('Adicione sua primeira modalidade acima.')
  })

  it('sessão expirada ao carregar chama onExpired', async () => {
    profileFailure = new ApiError('Sessão expirada', 401)
    const { onExpired } = await mount()
    expect(onExpired).toHaveBeenCalledOnce()
  })
})

describe('Perfil próprio: ações', () => {
  it('"Nome atualizado." é um toast de sucesso e a folha volta para "Editar perfil"', async () => {
    const { tree, onUser } = await mount()
    await openRename(tree)
    await type(tree, 'Nome completo', 'Novo Nome')
    await click(tree, 'Salvar nome')
    expect(onUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Nome' }))
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Nome atualizado.']])
    expect(textOf(tree)).toContain('Editar perfil')
  })

  it('erro comum ao salvar vira toast de erro e a folha continua aberta, sem mensagem fixa nela', async () => {
    rename = () => { throw new ApiError('Não foi possível salvar o nome agora.', 500) }
    const { tree } = await mount()
    await openRename(tree)
    await type(tree, 'Nome completo', 'Novo Nome')
    await click(tree, 'Salvar nome')
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['error', 'Não foi possível salvar o nome agora.']])
    expect(byLabel(tree, 'Nome completo')).toHaveLength(1)
    // Fora o toast (que a folha desenha no próprio viewport), nenhum alerta de erro ficou na folha.
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'alert' && node.props.accessibilityLabel === undefined
      && !String(node.props.testID ?? '').startsWith('toast'))).toHaveLength(0)
  })

  it('a recusa de campo do servidor (422 com campos) fica dentro da folha, sem toast', async () => {
    rename = () => { throw new ApiError('Dados inválidos.', 422, [{ field: 'name', message: 'Informe o nome completo.' }]) }
    const { tree } = await mount()
    await openRename(tree)
    await type(tree, 'Nome completo', 'Novo Nome')
    await click(tree, 'Salvar nome')
    expect(toasts()).toEqual([])
    expect(textOf(tree)).toContain('Dados inválidos.')
  })

  it('sessão expirada ao salvar vai ao login, sem toast', async () => {
    rename = () => { throw new ApiError('Sessão expirada', 401) }
    const { tree, onExpired } = await mount()
    await openRename(tree)
    await type(tree, 'Nome completo', 'Novo Nome')
    await click(tree, 'Salvar nome')
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
    expect(button(tree, 'Salvar nome')).toBeDefined()
  })
})
