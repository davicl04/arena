import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { ApiError, clearToken, request } from '../src/api/client'
import type { User } from '../src/api/client'
import { screens } from '../src/navigation/screens'
import type { ScreenComponent } from '../src/navigation/screens'
import { enableAct, hardwareBack, linking, ownBar, press, textOf } from './support/native'
import { textWithin } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-safe-area-context', async () => {
  const ReactModule = await import('react')
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) => ReactModule.createElement(name, props, children as React.ReactNode)
  return { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }), SafeAreaProvider: element('SafeAreaProvider'), SafeAreaView: element('SafeAreaView') }
})
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../global.css', () => ({}))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn(), clearToken: vi.fn() }))
vi.mock('../src/screens/AuthScreen', async () => {
  const ReactModule = await import('react')
  return { default: (props: Record<string, unknown>) => ReactModule.createElement('AuthScreen', props) }
})
vi.mock('../src/screens/CommunityScreen', () => ({ default: () => null }))
vi.mock('../src/screens/ProfileScreen', () => ({ default: () => null }))
vi.mock('../src/screens/TeamsScreen', () => ({ default: () => null }))

const h = React.createElement
const me: User = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const original = { ...screens }
const joins: string[] = []
let expire: () => void = () => undefined
let goTo: (screen: 'teams') => void = () => undefined
/** Sósia da tela de entrada: registra o token quando ela monta (não a cada renderização, que o shell refaz ao ler a placa do Jogar). */
function JoinSpy(props: { params: { token: string }; navigation: { back: () => void; go: (screen: 'teams') => void }; onExpired: () => void }) {
  React.useEffect(() => { joins.push(props.params.token) }, [props.params.token])
  React.useEffect(() => { expire = props.onExpired; goTo = props.navigation.go })
  return h('JoinProbe', { token: props.params.token }, ownBar('Entrar no time', props.navigation.back))
}

async function mountApp(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(App)) })
  return tree
}
const host = (tree: ReactTestRenderer, type: string) => tree.root.findAll(node => node.type === type)
const login = async (tree: ReactTestRenderer) => { await act(async () => { host(tree, 'AuthScreen')[0].props.onLogin(me) }) }

beforeEach(() => {
  enableAct()
  joins.length = 0
  hardwareBack.handlers.length = 0
  linking.initial = null
  linking.listeners.length = 0
  Object.assign(screens, original)
  // As telas de Meus times desenham a própria barra (placa escura): os sósias trazem o Voltar e o título que o shell não mostra.
  screens.join = JoinSpy as unknown as ScreenComponent<'join'>
  screens.teams = ((props: { navigation: { back: () => void } }) => ownBar('Meus times', props.navigation.back)) as unknown as ScreenComponent<'teams'>
  vi.mocked(clearToken).mockReset().mockResolvedValue(undefined)
  vi.mocked(request).mockReset().mockImplementation(async path => {
    if (path === '/me') throw new ApiError('Não autenticado', 401)
    return { unread_count: 0 } as never
  })
})

describe('App: falha ao conferir a sessão', () => {
  it('a falha do /me é um estado à parte da sessão expirada: mostra o erro com nova tentativa e entra quando volta', async () => {
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me') throw new ApiError('Servidor com problema.', 500)
      return { unread_count: 0 } as never
    })
    const tree = await mountApp()
    expect(host(tree, 'AuthScreen')).toHaveLength(1)
    expect(textOf(tree)).toContain('Não foi possível conectar')
    expect(textOf(tree)).toContain('Servidor com problema.')
    expect(textOf(tree)).not.toContain('Sua sessão expirou')
    vi.mocked(request).mockImplementation(async path => (path === '/me' ? me : { unread_count: 0 }) as never)
    const retry = tree.root.findAllByType('Pressable' as never).find(node => textWithin(node) === 'Tentar novamente')
    expect(retry).toBeTruthy()
    await act(async () => { retry!.props.onPress() })
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
  })
  it('login que falha por conexão liga o mesmo bloco de conexão, uma só vez, e Tentar novamente o limpa', async () => {
    const tree = await mountApp()
    expect(textOf(tree)).not.toContain('Não foi possível conectar')
    const down = new ApiError('Sem conexão com a ARENA.', 0)
    await act(async () => { host(tree, 'AuthScreen')[0].props.onConnectionFailure(down) })
    expect(textOf(tree)).toContain('Não foi possível conectar')
    expect(textOf(tree).split('Sem conexão com a ARENA.')).toHaveLength(2)
    vi.mocked(request).mockImplementation(async path => (path === '/me' ? me : { unread_count: 0 }) as never)
    const retry = tree.root.findAllByType('Pressable' as never).find(node => textWithin(node) === 'Tentar novamente')
    expect(retry).toBeTruthy()
    await act(async () => { retry!.props.onPress() })
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
  })
})

describe('App: link do time depois do login', () => {
  it('guarda o token do arena://entrar/{token} em memória e abre a tela de entrada depois do login', async () => {
    linking.initial = 'arena://entrar/abc_123-XYZ'
    const tree = await mountApp()
    expect(host(tree, 'AuthScreen')).toHaveLength(1)
    expect(joins).toEqual([])
    await login(tree)
    expect(joins).toEqual(['abc_123-XYZ'])
    expect(host(tree, 'JoinProbe')[0].props.token).toBe('abc_123-XYZ')
    expect(textOf(tree)).toContain('Entrar no time')
  })

  it('o token é consumido ao abrir: voltar e navegar não reabre o link', async () => {
    linking.initial = 'https://arena.example.com/entrar/web-token'
    const tree = await mountApp()
    await login(tree)
    expect(joins).toEqual(['web-token'])
    await press(tree, 'Voltar')
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    await press(tree, 'Meus times')
    await press(tree, 'Voltar')
    expect(joins).toEqual(['web-token'])
  })

  it('um link recebido com o app aberto e a sessão ativa abre a tela de entrada na hora', async () => {
    vi.mocked(request).mockImplementation(async path => (path === '/me' ? me : { unread_count: 0 }) as never)
    const tree = await mountApp()
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    await act(async () => { linking.emit('arena://entrar/novo-link') })
    expect(joins).toEqual(['novo-link'])
    expect(textOf(tree)).toContain('Entrar no time')
  })

  it('sem link, o login leva direto ao Início', async () => {
    const tree = await mountApp()
    await login(tree)
    expect(joins).toEqual([])
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
  })

  it('sessão expirada com a tela de entrada aberta devolve o token à memória e reabre depois do próximo login', async () => {
    linking.initial = 'arena://entrar/volta-123'
    const tree = await mountApp()
    await login(tree)
    expect(joins).toEqual(['volta-123'])
    await act(async () => { expire() })
    expect(host(tree, 'AuthScreen')).toHaveLength(1)
    expect(textOf(tree)).toContain('Sua sessão expirou. Entre novamente.')
    // Sessão expirada é só o texto: não há nova tentativa (que é da falha ao conferir a sessão).
    expect(textOf(tree)).not.toContain('Tentar novamente')
    expect(clearToken).toHaveBeenCalled()
    await login(tree)
    expect(joins).toEqual(['volta-123', 'volta-123'])
  })

  it('sessão expirada com a entrada do time só mais abaixo na pilha não devolve o token: ela já ficou para trás', async () => {
    linking.initial = 'arena://entrar/ficou-para-tras'
    const tree = await mountApp()
    await login(tree)
    expect(joins).toEqual(['ficou-para-tras'])
    // A pessoa segue da entrada para Meus times: a pilha fica Início > Entrar no time > Meus times.
    await act(async () => { goTo('teams') })
    expect(host(tree, 'JoinProbe')).toHaveLength(0)
    expect(textOf(tree)).toContain('Meus times')
    await act(async () => { expire() })
    expect(host(tree, 'AuthScreen')).toHaveLength(1)
    await login(tree)
    expect(joins).toEqual(['ficou-para-tras'])
    expect(host(tree, 'JoinProbe')).toHaveLength(0)
  })

  it('401 em outra tela expira a sessão sem token pendente', async () => {
    const tree = await mountApp()
    await login(tree)
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    await press(tree, 'Perfil')
    await press(tree, 'Início')
    expect(host(tree, 'AuthScreen')).toHaveLength(1)
    await login(tree)
    expect(joins).toEqual([])
  })

  it('mostra o erro de conexão e tenta de novo', async () => {
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem conexão', 0))
    const tree = await mountApp()
    expect(textOf(tree)).toContain('Sem conexão')
    expect(host(tree, 'AuthScreen')).toHaveLength(1)
    vi.mocked(request).mockImplementation(async path => (path === '/me' ? me : { unread_count: 0 }) as never)
    const retry = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityRole === 'button')
    await act(async () => { retry!.props.onPress() })
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
  })
})

describe('App: erro inesperado ao desenhar uma tela', () => {
  it('mostra a placa de erro em português; "Tentar de novo" remonta a árvore e a pessoa segue conectada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let broken = true
    screens.home = (() => { if (broken) throw new Error('TypeError: detalhe técnico'); return h('Text', null, 'Início restaurado') }) as unknown as ScreenComponent<'home'>
    const tree = await mountApp()
    await login(tree)
    expect(textOf(tree)).toContain('Algo deu errado')
    expect(textOf(tree)).not.toContain('TypeError')
    expect(host(tree, 'AuthScreen')).toHaveLength(0)
    broken = false
    await press(tree, 'Tentar de novo')
    expect(textOf(tree)).toContain('Início restaurado')
    expect(textOf(tree)).not.toContain('Algo deu errado')
    // A conta continua na memória: não voltou ao login.
    expect(host(tree, 'AuthScreen')).toHaveLength(0)
  })
})
