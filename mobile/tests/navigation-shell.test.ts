import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { User } from '../src/api/client'
import { screens } from '../src/navigation/screens'
import type { ScreenComponent } from '../src/navigation/screens'
import { useJoinLink } from '../src/navigation/useJoinLink'
import type { Navigation } from '../src/navigation/useNavigation'
import ArenaShell from '../src/screens/ArenaShell'
import { appState, byLabel, enableAct, hardwareBack, linking, ownBar, press, textOf } from './support/native'
import { matchCard, playBoard, search } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
// As telas já existentes são testadas à parte; aqui elas só expõem as props que o shell lhes entrega.
vi.mock('../src/screens/CommunityScreen', async () => {
  const ReactModule = await import('react')
  return { default: (props: Record<string, unknown>) => ReactModule.createElement('CommunityScreen', props) }
})
vi.mock('../src/screens/ProfileScreen', async () => {
  const ReactModule = await import('react')
  return { default: (props: Record<string, unknown>) => ReactModule.createElement('ProfileScreen', props) }
})
// Meus times desenha a própria barra (placa escura): o sósia expõe as props e a barra, como a tela real.
vi.mock('../src/screens/TeamsScreen', async () => {
  const ReactModule = await import('react')
  const { ownBar } = await import('./support/native')
  return { default: (props: { navigation: { back: () => void } }) => ReactModule.createElement('TeamsScreen', props, ownBar('Meus times', props.navigation.back)) }
})
// A placa do Jogar é testada à parte (play-screen); aqui só expõe as props que o shell lhe entrega.
vi.mock('../src/screens/PlayScreen', async () => (await import('./support/review')).hostScreen('PlayScreen'))
// A partida desenha a própria barra e é testada à parte (match-screen, match-chat e match-slots): o sósia expõe as props e a barra.
vi.mock('../src/screens/MatchScreen', async () => {
  const ReactModule = await import('react')
  const { ownBar } = await import('./support/native')
  return { default: (props: { navigation: { back: () => void } }) => ReactModule.createElement('MatchScreen', props, ownBar('Partida', props.navigation.back)) }
})
// Chaveamento, partidas e decisão do campeonato desenham a própria barra e são testadas à parte (bracket-screen, event-matches e
// result-decision): os sósias expõem as props e a barra.
vi.mock('../src/screens/BracketScreen', async () => (await import('./support/brackets')).hostWithBar('BracketScreen', 'Chaveamento'))
vi.mock('../src/screens/EventMatchesScreen', async () => (await import('./support/brackets')).hostWithBar('EventMatchesScreen', 'Partidas'))
vi.mock('../src/screens/ResultDecisionScreen', async () => (await import('./support/brackets')).hostWithBar('ResultDecisionScreen', 'Decidir resultado'))
vi.mock('../src/screens/UserProfileScreen', async () => {
  const ReactModule = await import('react')
  return { default: (props: Record<string, unknown>) => ReactModule.createElement('UserProfileScreen', props) }
})
// Filas da administração e denúncias: testadas à parte (admin-queues e moderation).
vi.mock('../src/screens/AdminOrganizerRequestsScreen', async () => (await import('./support/review')).hostScreen('AdminOrganizerRequestsScreen'))
vi.mock('../src/screens/AdminPaidEventsScreen', async () => (await import('./support/review')).hostScreen('AdminPaidEventsScreen'))
vi.mock('../src/screens/AdminRevokedEventsScreen', async () => (await import('./support/review')).hostScreen('AdminRevokedEventsScreen'))
vi.mock('../src/screens/AdminRefundDisputesScreen', async () => (await import('./support/review')).hostScreen('AdminRefundDisputesScreen'))
vi.mock('../src/screens/ModerationScreen', async () => (await import('./support/review')).hostScreen('ModerationScreen'))
// Ranking e as filas de quadras e de W.O.: testados à parte (ranking-screen, admin-match-queues); o Ranking tem abas internas, que confundiriam a barra inferior.
vi.mock('../src/screens/RankingScreen', async () => (await import('./support/review')).hostScreen('RankingScreen'))
vi.mock('../src/screens/AdminCourtSuggestionsScreen', async () => (await import('./support/review')).hostScreen('AdminCourtSuggestionsScreen'))
vi.mock('../src/screens/AdminWalkoverDisputesScreen', async () => (await import('./support/review')).hostScreen('AdminWalkoverDisputesScreen'))

const h = React.createElement
const me: User = { id: 1, name: 'Maria Souza', username: 'maria.s', email: 'maria@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const original = { ...screens }

let unread = 0
/** Resposta de `GET /me/play`; `null` (sem placa) cai na placa vazia do `normalizeBoard`. */
let board: ReturnType<typeof playBoard> | null = null
type ShellProps = Partial<React.ComponentProps<typeof ArenaShell>>
async function mount(props: ShellProps = {}) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(ArenaShell, { user: me, onUser: vi.fn(), onLogout: vi.fn(), onExpired: vi.fn(), ...props })) })
  return tree
}
const host = (tree: ReactTestRenderer, type: string) => tree.root.findAll(node => node.type === type)
const tabs = (tree: ReactTestRenderer) => tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityRole === 'tab')
const selectedTab = (tree: ReactTestRenderer) => tabs(tree).filter(entry => entry.props.accessibilityState.selected).map(entry => entry.props.accessibilityLabel)
const back = async () => { let handled = false; await act(async () => { handled = hardwareBack.press() }); return handled }

beforeEach(() => {
  enableAct()
  unread = 0
  board = null
  appState.reset()
  hardwareBack.handlers.length = 0
  linking.initial = null
  linking.listeners.length = 0
  vi.mocked(request).mockReset().mockImplementation(async path => (path === '/me/notifications/unread-count' ? { unread_count: unread } : path === '/me/play' ? board : { items: [], next_cursor: null }) as never)
})
afterEach(() => { Object.assign(screens, original); vi.useRealTimers() })

describe('barra inferior e abas', () => {
  it('preserva Partidas ao abrir a partida pelo perfil e voltar', async () => {
    const tree = await mount()
    await press(tree, 'Perfil')
    const profile = host(tree, 'ProfileScreen')[0]
    await act(async () => { profile.props.onTabChange('Partidas') })
    expect(host(tree, 'ProfileScreen')[0].props.tab).toBe('Partidas')
    await act(async () => { host(tree, 'ProfileScreen')[0].props.onOpenMatch(31) })
    expect(host(tree, 'ProfileScreen')).toHaveLength(0)
    expect(host(tree, 'MatchScreen')).toHaveLength(1)
    await back()
    expect(host(tree, 'ProfileScreen')[0].props.tab).toBe('Partidas')
    await act(async () => { tree.unmount() })
  })
  it('abre no Início, com Início | Ranking | JOGAR | Comunidade | Perfil e o JOGAR no centro', async () => {
    const tree = await mount()
    expect(tabs(tree).map(entry => entry.props.accessibilityLabel)).toEqual(['Início', 'Ranking', 'JOGAR', 'Comunidade', 'Perfil'])
    expect(selectedTab(tree)).toEqual(['Início'])
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    expect(host(tree, 'CommunityScreen')).toHaveLength(0)
  })

  it('cada aba troca a tela e acende a si mesma', async () => {
    const tree = await mount()
    await press(tree, 'Comunidade')
    expect(host(tree, 'CommunityScreen')).toHaveLength(1)
    expect(selectedTab(tree)).toEqual(['Comunidade'])
    expect(textOf(tree)).toContain('arena.')
    await press(tree, 'Perfil')
    expect(host(tree, 'ProfileScreen')).toHaveLength(1)
    expect(selectedTab(tree)).toEqual(['Perfil'])
    await press(tree, 'JOGAR')
    expect(selectedTab(tree)).toEqual(['JOGAR'])
    expect(host(tree, 'PlayScreen')).toHaveLength(1)
    expect(byLabel(tree, 'JOGAR').length).toBeGreaterThan(0)
    // A placa do Jogar desenha o próprio topo: o shell não põe a faixa "arena." acima dela.
    expect(textOf(tree)).not.toContain('arena.')
    await press(tree, 'Ranking')
    expect(selectedTab(tree)).toEqual(['Ranking'])
    await press(tree, 'Início')
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
  })
})

const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)

describe('pilha de telas e voltar', () => {
  it('empilha a tela, mostra o título com Voltar e acende a aba da área', async () => {
    const tree = await mount()
    await press(tree, 'Meus times')
    expect(textOf(tree)).toContain('Meus times')
    expect(host(tree, 'TeamsScreen')).toHaveLength(1)
    expect(selectedTab(tree)).toEqual(['JOGAR'])
    await press(tree, 'Voltar')
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    expect(selectedTab(tree)).toEqual(['Início'])
  })

  it('empilha várias telas e volta uma a uma, com o título do contexto (Provas)', async () => {
    const tree = await mount()
    // Campeonatos e provas leem o perfil e as cidades (listas simples) antes dos cartazes.
    vi.mocked(request).mockImplementation(async path => (path === '/me/sports-profiles' || path === '/cities' ? [] : { items: [], next_cursor: null }) as never)
    await press(tree, 'Provas de corrida')
    expect(textOf(tree)).toContain('Provas')
    await press(tree, 'Voltar')
    await press(tree, 'Campeonatos')
    expect(textOf(tree)).toContain('Campeonatos')
    await press(tree, 'Voltar')
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    await press(tree, 'Seja organizador')
    expect(selectedTab(tree)).toEqual(['Perfil'])
    await press(tree, 'Voltar')
    await press(tree, 'Meus eventos')
    expect(textOf(tree)).toContain('Meus eventos')
  })

  it('o botão voltar do Android volta uma tela; no Início, deixa o app sair', async () => {
    const tree = await mount()
    expect(await back()).toBe(false)
    await press(tree, 'Meus times')
    expect(await back()).toBe(true)
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    expect(await back()).toBe(false)
    await press(tree, 'Comunidade')
    expect(await back()).toBe(true)
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    await act(async () => { tree.unmount() })
    expect(hardwareBack.handlers).toHaveLength(0)
  })

  it('o quadro "Nova foto" do Perfil abre a Comunidade já na publicação e consome o pedido', async () => {
    const tree = await mount()
    await press(tree, 'Perfil')
    await act(async () => { host(tree, 'ProfileScreen')[0].props.onNewPhoto() })
    expect(selectedTab(tree)).toEqual(['Comunidade'])
    expect(host(tree, 'CommunityScreen')[0].props.composeOnOpen).toBe(true)
    await act(async () => { host(tree, 'CommunityScreen')[0].props.onComposeStarted() })
    expect(host(tree, 'CommunityScreen')[0].props.composeOnOpen).toBe(false)
    expect(host(tree, 'CommunityScreen')[0].props.user).toBe(me)
  })

  it('"Ver perfil" (Meus times) empilha o perfil do atleta sobre a tela de origem e o voltar a restaura', async () => {
    const tree = await mount()
    await press(tree, 'Meus times')
    await act(async () => { host(tree, 'TeamsScreen')[0].props.navigation.go('user-profile', { userId: 9 }) })
    expect(host(tree, 'UserProfileScreen')[0].props.params).toEqual({ userId: 9 })
    expect(host(tree, 'TeamsScreen')).toHaveLength(0)
    // O perfil tem a própria barra: o cabeçalho claro do shell não aparece.
    expect(byLabel(tree, 'Voltar')).toHaveLength(0)
    expect(await back()).toBe(true)
    expect(host(tree, 'UserProfileScreen')).toHaveLength(0)
    expect(host(tree, 'TeamsScreen')).toHaveLength(1)
  })

  it('as telas com barra própria dispensam o cabeçalho claro do shell; as demais telas empilhadas o usam', async () => {
    const tree = await mount()
    await press(tree, 'Meus times')
    // Só o Voltar da própria barra (o sósia de Meus times), sem o do shell.
    expect(byLabel(tree, 'Voltar')).toHaveLength(1)
    expect(textOf(tree).split('Meus times')).toHaveLength(2)
    await act(async () => { host(tree, 'TeamsScreen')[0].props.navigation.go('notifications') })
    expect(byLabel(tree, 'Voltar')).toHaveLength(1)
    expect(textOf(tree)).toContain('Notificações')
  })

  it('entrega usuário, saída e expiração às telas existentes', async () => {
    const onExpired = vi.fn(); const onLogout = vi.fn(); const onUser = vi.fn()
    const tree = await mount({ onExpired, onLogout, onUser })
    await press(tree, 'Perfil')
    const profile = host(tree, 'ProfileScreen')[0].props
    expect(profile).toMatchObject({ user: me, onLogout, onUser })
    profile.onExpired()
    expect(onExpired).toHaveBeenCalledWith(undefined)
  })
})

describe('Início: sino e atalhos', () => {
  it('mostra o sino sem contador quando não há notificações não lidas', async () => {
    const tree = await mount()
    expect(byLabel(tree, 'Notificações')).toHaveLength(1)
    expect(byId(tree, 'unread-indicator')).toHaveLength(0)
    expect(vi.mocked(request)).toHaveBeenCalledWith('/me/notifications/unread-count')
  })

  it('anuncia e mostra o contador de não lidas, limitado a 9+', async () => {
    unread = 3
    const tree = await mount()
    expect(byLabel(tree, 'Notificações, 3 não lidas')).toHaveLength(1)
    expect(byId(tree, 'unread-indicator')).toHaveLength(1)
    expect(textOf(tree)).toContain('3')
    unread = 1
    expect(byLabel(await mount(), 'Notificações, 1 não lida')).toHaveLength(1)
    unread = 25
    expect(textOf(await mount())).toContain('9+')
  })

  it('o sino abre Notificações (acende o Início); falha de leitura não mostra contador', async () => {
    const tree = await mount()
    await press(tree, 'Notificações')
    expect(textOf(tree)).toContain('Notificações')
    expect(selectedTab(tree)).toEqual(['Início'])
    vi.mocked(request).mockRejectedValue(new ApiError('Fora do ar', 500))
    const offline = await mount()
    expect(byId(offline, 'unread-indicator')).toHaveLength(0)
  })

  it('401 na leitura do contador expira a sessão', async () => {
    const onExpired = vi.fn()
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    await mount({ onExpired })
    // O contador do sino e a placa do Jogar (lida pelo shell) respondem 401 juntos; o App trata a expiração de forma idempotente.
    expect(onExpired).toHaveBeenCalled()
    expect(vi.mocked(request)).toHaveBeenCalledWith('/me/notifications/unread-count')
    expect(vi.mocked(request)).toHaveBeenCalledWith('/me/play')
  })

  it('administração só aparece para quem é administrador e cada fila abre a própria tela', async () => {
    const plain = await mount()
    expect(byLabel(plain, 'Eventos pagos')).toHaveLength(0)
    const tree = await mount({ user: { ...me, is_admin: true } })
    for (const [label, title, screen] of [
      ['Pedidos de organizador', 'Pedidos de organizador', 'AdminOrganizerRequestsScreen'], ['Eventos pagos', 'Eventos pagos', 'AdminPaidEventsScreen'],
      ['Organizador revogado', 'Organizador revogado', 'AdminRevokedEventsScreen'], ['Devoluções contestadas', 'Devoluções contestadas', 'AdminRefundDisputesScreen'],
      ['Sugestões de quadra', 'Sugestões de quadra', 'AdminCourtSuggestionsScreen'], ['W.O. contestados', 'W.O. contestados', 'AdminWalkoverDisputesScreen'], ['Denúncias', 'Denúncias', 'ModerationScreen'],
    ] as const) {
      await press(tree, label)
      expect(host(tree, screen)).toHaveLength(1)
      expect(host(tree, screen)[0].props.user.is_admin).toBe(true)
      expect(textOf(tree)).toContain(title)
      expect(selectedTab(tree)).toEqual(['Perfil'])
      await press(tree, 'Voltar')
    }
  })

  it('"Ver perfil" da fila de pedidos de organizador empilha o perfil do atleta e volta à fila; o próprio perfil é a aba Perfil', async () => {
    const tree = await mount({ user: { ...me, is_admin: true } })
    await press(tree, 'Pedidos de organizador')
    await act(async () => { host(tree, 'AdminOrganizerRequestsScreen')[0].props.onOpenProfile(9) })
    expect(host(tree, 'UserProfileScreen')[0].props.params).toEqual({ userId: 9 })
    expect(await back()).toBe(true)
    expect(host(tree, 'AdminOrganizerRequestsScreen')).toHaveLength(1)
    await act(async () => { host(tree, 'AdminOrganizerRequestsScreen')[0].props.onOpenProfile(me.id) })
    expect(host(tree, 'UserProfileScreen')).toHaveLength(0)
    expect(selectedTab(tree)).toEqual(['Perfil'])
  })
})

describe('link do time', () => {
  const probe = vi.fn()
  const installProbe = () => { screens.join = ((props: { params: { token: string }; navigation: { back: () => void }; onExpired: () => void }) => { probe(props); return h('JoinProbe', { token: props.params.token }, ownBar('Entrar no time', props.navigation.back)) }) as unknown as ScreenComponent<'join'> }

  it('abre a tela de entrada com o token uma vez, sobre o Início, e o consome', async () => {
    installProbe()
    const onJoinOpened = vi.fn()
    const tree = await mount({ joinToken: 'tok-123', onJoinOpened })
    expect(host(tree, 'JoinProbe')[0].props.token).toBe('tok-123')
    expect(onJoinOpened).toHaveBeenCalledTimes(1)
    expect(selectedTab(tree)).toEqual(['JOGAR'])
    expect(textOf(tree)).toContain('Entrar no time')
    await press(tree, 'Voltar')
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
    expect(onJoinOpened).toHaveBeenCalledTimes(1)
  })

  it('sem token, não abre nada', async () => {
    installProbe()
    const onJoinOpened = vi.fn()
    const tree = await mount({ joinToken: null, onJoinOpened })
    expect(host(tree, 'JoinProbe')).toHaveLength(0)
    expect(onJoinOpened).not.toHaveBeenCalled()
  })

  it('se a sessão expirar com a tela de entrada aberta, o token volta ao App para o próximo login', async () => {
    installProbe()
    const onExpired = vi.fn()
    await mount({ joinToken: 'tok-123', onExpired })
    probe.mock.calls.at(-1)![0].onExpired()
    expect(onExpired).toHaveBeenCalledWith('tok-123')
  })
})

describe('useJoinLink: arena://entrar/{token} e http(s)://…/entrar/{token}', () => {
  let current!: ReturnType<typeof useJoinLink>
  function Probe() { current = useJoinLink(); return null }
  async function mountProbe() {
    let tree!: ReactTestRenderer
    await act(async () => { tree = create(h(Probe)) })
    return tree
  }

  it('lê o endereço de abertura do app', async () => {
    linking.initial = 'arena://entrar/aberto-123'
    await mountProbe()
    expect(current.joinToken).toBe('aberto-123')
  })

  it('lê o endereço recebido com o app aberto (http ou esquema do app) e ignora os demais', async () => {
    await mountProbe()
    expect(current.joinToken).toBeNull()
    await act(async () => { linking.emit('https://arena.example.com/perfil/ana') })
    expect(current.joinToken).toBeNull()
    await act(async () => { linking.emit('https://arena.example.com/entrar/web-456') })
    expect(current.joinToken).toBe('web-456')
    await act(async () => { linking.emit('arena://entrar/app-789') })
    expect(current.joinToken).toBe('app-789')
  })

  it('o token só existe em memória: consume o apaga e restore o devolve', async () => {
    linking.initial = 'arena://entrar/aberto-123'
    await mountProbe()
    await act(async () => { current.consume() })
    expect(current.joinToken).toBeNull()
    await act(async () => { current.restore('devolvido-1') })
    expect(current.joinToken).toBe('devolvido-1')
  })

  it('para de ouvir ao desmontar e ignora a abertura sem endereço', async () => {
    const tree = await mountProbe()
    expect(linking.listeners).toHaveLength(1)
    await act(async () => { tree.unmount() })
    expect(linking.listeners).toHaveLength(0)
  })
})

describe('Jogar e campeonatos: rotas declaradas (em breve até as frentes)', () => {
  // O sósia de Meus times expõe a navegação que o shell entrega às telas.
  const shellNavigation = (tree: ReactTestRenderer) => host(tree, 'TeamsScreen')[0].props.navigation

  it('a partida abre a própria tela com os parâmetros e o voltar dela, e acende a aba JOGAR', async () => {
    const tree = await mount()
    await press(tree, 'Meus times')
    await act(async () => { shellNavigation(tree).go('match', { matchId: 3 }) })
    expect(host(tree, 'MatchScreen')).toHaveLength(1)
    expect(host(tree, 'MatchScreen')[0].props.params).toEqual({ matchId: 3 })
    // A tela desenha a própria barra: o shell não mostra o cabeçalho claro, e há um voltar só.
    expect(byLabel(tree, 'Voltar')).toHaveLength(1)
    expect(selectedTab(tree)).toEqual(['JOGAR'])
    await press(tree, 'Voltar')
    expect(host(tree, 'TeamsScreen')).toHaveLength(1)
  })

  it('chaveamento, partidas e decisão abrem as telas próprias com os parâmetros e o voltar da barra, e acendem a aba da área', async () => {
    const tree = await mount()
    await press(tree, 'Meus times')
    for (const [route, params, host_, title] of [
      ['event-bracket', { eventId: 5 }, 'BracketScreen', 'Chaveamento'],
      ['event-matches', { eventId: 5, matchId: 11 }, 'EventMatchesScreen', 'Partidas'],
      ['result-decision', { matchId: 9 }, 'ResultDecisionScreen', 'Decidir resultado'],
    ] as const) {
      await act(async () => { shellNavigation(tree).go(route, params) })
      expect(host(tree, host_)).toHaveLength(1)
      expect(host(tree, host_)[0].props.params).toEqual(params)
      expect(textOf(tree)).toContain(title)
      expect(textOf(tree)).not.toMatch(/pontos|moedas|partida encontrada/i)
      // Telas com barra própria dispensam o cabeçalho do shell: há um voltar só, o da própria tela.
      expect(byLabel(tree, 'Voltar')).toHaveLength(1)
      expect(selectedTab(tree)).toEqual(['Perfil'])
      await press(tree, 'Voltar')
      expect(host(tree, 'TeamsScreen')).toHaveLength(1)
    }
  })

  it('o JOGAR e o Ranking abrem com parâmetros (partida da proposta, modalidade e distância) e zeram a pilha', async () => {
    const seen: Record<string, unknown> = {}
    screens.play = ((props: { params: unknown; navigation: unknown }) => { seen.play = props.params; seen.navigation = props.navigation; return h('PlayProbe', {}) }) as unknown as ScreenComponent<'play'>
    screens.ranking = ((props: { params: unknown }) => { seen.ranking = props.params; return h('RankingProbe', {}) }) as unknown as ScreenComponent<'ranking'>
    const tree = await mount()
    await press(tree, 'Meus times')
    await act(async () => { shellNavigation(tree).go('play', { matchId: 50 }) })
    expect(seen.play).toEqual({ matchId: 50 })
    expect(selectedTab(tree)).toEqual(['JOGAR'])
    // Aba: zera a pilha (Meus times saiu) e o voltar não leva mais a ela.
    expect(host(tree, 'TeamsScreen')).toHaveLength(0)
    await act(async () => { (seen.navigation as Navigation).go('ranking', { sport: 'corrida', distanceKm: 10 }) })
    expect(seen.ranking).toEqual({ sport: 'corrida', distanceKm: 10 })
    expect(selectedTab(tree)).toEqual(['Ranking'])
    await press(tree, 'JOGAR')
    expect(seen.play).toBeUndefined()
  })

  it('toda tela recebe a placa do Jogar e a função que a relê; o shell lê GET /me/play ao abrir', async () => {
    const probe = vi.fn()
    screens.match = ((props: { playBoard: unknown; refreshPlayBoard: unknown }) => { probe(props); return h('MatchProbe', {}) }) as unknown as ScreenComponent<'match'>
    board = playBoard({ searches: [search()], matches: [matchCard()] })
    const tree = await mount()
    expect(vi.mocked(request)).toHaveBeenCalledWith('/me/play')
    await press(tree, 'Meus times')
    await act(async () => { shellNavigation(tree).go('match', { matchId: 50 }) })
    const props = probe.mock.calls.at(-1)![0]
    expect(props.playBoard.board).toEqual(board)
    expect(props.playBoard.loading).toBe(false)
    expect(props.playBoard.deferred).toEqual([])
    expect(typeof props.playBoard.defer).toBe('function')
    vi.mocked(request).mockClear()
    const next = playBoard()
    board = next
    let reloaded: unknown
    await act(async () => { reloaded = await props.refreshPlayBoard() })
    expect(reloaded).toEqual(next)
    expect(vi.mocked(request)).toHaveBeenCalledWith('/me/play')
    expect(probe.mock.calls.at(-1)![0].playBoard.board).toEqual(next)
  })
})

describe('ponto do JOGAR: a placa do Jogar acende o aviso da navegação', () => {
  const dot = (tree: ReactTestRenderer) => byId(tree, 'play-attention')
  const play = (tree: ReactTestRenderer) => tabs(tree).find(entry => entry.props.accessibilityLabel.startsWith('JOGAR'))!

  it('sem busca, proposta, oferta nem partida combinando, não há ponto e o nome é só JOGAR', async () => {
    board = playBoard()
    const tree = await mount()
    expect(dot(tree)).toHaveLength(0)
    expect(play(tree).props.accessibilityLabel).toBe('JOGAR')
  })

  it('com atenção (attention de /me/play), acende o ponto e o nome acessível avisa o que há', async () => {
    board = playBoard({ searches: [search()] })
    const tree = await mount()
    expect(dot(tree)).toHaveLength(1)
    expect(dot(tree)[0].props.accessible).toBe(false)
    expect(dot(tree)[0].props.importantForAccessibility).toBe('no-hide-descendants')
    expect(play(tree).props.accessibilityLabel).toBe('JOGAR, há uma busca, proposta ou partida em andamento')
    await press(tree, 'JOGAR, há uma busca, proposta ou partida em andamento')
    expect(selectedTab(tree)).toEqual(['JOGAR, há uma busca, proposta ou partida em andamento'])
  })

  it('falha ao ler a placa não acende o ponto nem derruba o shell', async () => {
    vi.mocked(request).mockImplementation(async path => { if (path === '/me/play') throw new ApiError('Fora do ar', 500); return { unread_count: 0 } as never })
    const tree = await mount()
    expect(dot(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('Bora jogar, Maria?')
  })
})
