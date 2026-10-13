import React, { useMemo, useState } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { carouselMetrics } from '../src/components/teams/TeamCardCarousel'
import TeamsScreen from '../src/screens/TeamsScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { answer, fakeNavigation, joinRequest, member, me, receivedInvite, sentInvite, team, TOKEN } from './support/teams'
import type { FakeNavigation, Handler } from './support/teams'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('expo-camera', async () => {
  const ReactModule = await import('react')
  return { CameraView: (props: Record<string, unknown>) => ReactModule.createElement('CameraView', props), useCameraPermissions: vi.fn() }
})
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
type Params = React.ComponentProps<typeof TeamsScreen>['params']

const A = team(10, { name: 'Ferrugem FC', member_count: 12, representative_count: 2, pending_join_requests: 1, pending_invites: 1 })
const B = team(20, { name: 'Leões do Cerrado', my_role: 'membro', member_count: 5, representative_count: 1 })
const mine = member(1, { name: 'Maria Souza', first_name: 'Maria', role: 'representante', is_me: true, position: 'goleiro' })
const others = Array.from({ length: 11 }, (_, index) => member(index + 2))
const roster = [mine, ...others]

/** Rotas padrão: dois times (representante em Ferrugem FC, membro em Leões), elenco de 12 e sem convites; `extra` sobrepõe. */
function serve(extra: Handler = () => undefined) {
  vi.mocked(request).mockImplementation(answer(async (path, method, body) => {
    const custom = await extra(path, method, body)
    if (custom !== undefined) return custom
    if (path === '/me/teams') return { items: [A, B] }
    if (path === '/teams/10/members') return { items: roster }
    if (path === '/teams/20/members') return { items: [member(1, { name: 'Maria Souza', is_me: true }), member(30)] }
    if (path === '/teams/10/join-requests') return { items: [joinRequest(5, 10, 'Paulo Ramos')] }
    if (path === '/teams/10/invites') return { items: [sentInvite(3, 'Rita Alves')] }
    return undefined
  }))
}
const calls = () => vi.mocked(request).mock.calls

let navigation: FakeNavigation
const onExpired = vi.fn()
const scroller = { scrollTo: vi.fn() }

function Harness({ initial }: { initial: Params }) {
  const [params, setParams] = useState(initial)
  // `setParams` da pilha troca os parâmetros da tela atual: o espelho mantém o ciclo real (time selecionado, pedidos consumidos).
  const nav = useMemo(() => ({ ...navigation, setParams: (screen: 'teams', patch: object) => { navigation.setParams(screen, patch); setParams(old => ({ ...old, ...patch })) } }), [])
  return h(TeamsScreen, { user: me, navigation: nav as never, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Meus times' })
}
async function mount(initial: Params = undefined): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(Harness, { initial }), { createNodeMock: element => element.type === 'ScrollView' ? scroller : null }) })
  return tree
}
const host = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)
const memberLabel = (extra: Parameters<typeof member>[1], userId = 3) => {
  const entry = member(userId, extra)
  return [entry.name, 'Defesa', entry.role === 'representante' ? 'Representante' : null].filter(Boolean).join(' · ')
}
const settle = async (offsetX: number, tree: ReactTestRenderer) => {
  await act(async () => { host(tree, 'team-carousel')[0].props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: offsetX } } }) })
}

beforeEach(() => {
  enableAct()
  navigation = fakeNavigation()
  onExpired.mockReset()
  scroller.scrollTo.mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(TOKEN)
  vi.mocked(request).mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe('Meus times: placa, carrossel de carteirinhas e elenco', () => {
  it('mostra as carteirinhas com a grade de formatos, o último quadro "Criar time" e o elenco do cartão centralizado', async () => {
    serve()
    const tree = await mount()
    // A placa traz a própria barra (o shell não desenha o cabeçalho): título "Meus times" e o Voltar.
    expect(textOf(tree)).toContain('Meus times')
    await press(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    expect(textOf(tree)).toContain('Ferrugem FC')
    expect(textOf(tree)).toContain('Leões do Cerrado')
    expect(textOf(tree)).toContain('Brasília · você representa')
    expect(textOf(tree)).toContain('Brasília · você é membro')
    expect(host(tree, 'team-slide-10')).toHaveLength(1)
    expect(host(tree, 'team-slide-20')).toHaveLength(1)
    expect(host(tree, 'team-slide-new')).toHaveLength(1)
    // Três células Futsal | Society | Campo por carteirinha, sem jogos.
    expect(host(tree, 'format-tile-empty')).toHaveLength(6)
    expect(textOf(tree)).toContain('Time 1 de 2')
    // Elenco E1: 11 rostos e o "+1"; Ver todos mostra os 12.
    expect(textOf(tree)).toContain('Elenco · 12')
    expect(byLabel(tree, memberLabel({}, 2)).length).toBeGreaterThan(0)
    expect(byLabel(tree, memberLabel({}, 12))).toHaveLength(0)
    await press(tree, 'Ver todos os 12 atletas')
    expect(byLabel(tree, memberLabel({}, 12)).length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Ver todos os 12 atletas')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('representante tem Convidar, Link e QR e Editar; membro tem Sair do time', async () => {
    serve()
    const tree = await mount()
    await press(tree, 'Convidar para o Ferrugem FC')
    expect(navigation.go).toHaveBeenLastCalledWith('team-invite', { teamId: 10 })
    await press(tree, 'Link e QR do time')
    expect(navigation.go).toHaveBeenLastCalledWith('team-invite', { teamId: 10, link: true })
    await press(tree, 'Editar time')
    expect(navigation.go).toHaveBeenLastCalledWith('team-form', { teamId: 10 })
    expect(byLabel(tree, 'Sair do Ferrugem FC')).toHaveLength(0)
    expect(byLabel(tree, 'Sair do Leões do Cerrado')).toHaveLength(1)
    await press(tree, 'Criar time')
    expect(navigation.go).toHaveBeenLastCalledWith('team-form')
    // Os botões só com ícone têm rótulo, papel e área de toque de 44 pt.
    const iconButton = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Editar time')[0]
    expect(iconButton.props.accessibilityRole).toBe('button')
    expect(iconButton.props.style.minHeight).toBeGreaterThanOrEqual(44)
    expect(iconButton.props.style.minWidth).toBeGreaterThanOrEqual(44)
    await act(async () => { tree.unmount() })
  })

  it('a rolagem do carrossel troca o time selecionado e o elenco; os pontos levam a cada cartão', async () => {
    serve()
    const tree = await mount()
    const { step } = carouselMetrics(390)
    expect(calls().map(call => call[0])).toContain('/teams/10/members')
    await settle(step, tree)
    expect(navigation.setParams).toHaveBeenLastCalledWith('teams', { teamId: 20 })
    expect(calls().map(call => call[0])).toContain('/teams/20/members')
    expect(textOf(tree)).toContain('Time 2 de 2')
    // O quadro "Criar time" (índice 2) não troca o elenco; os pontos têm rótulo e estado.
    await settle(step * 2, tree)
    expect(navigation.setParams).toHaveBeenCalledTimes(1)
    expect(byLabel(tree, 'Mostrar Leões do Cerrado')[0].props.accessibilityState.selected).toBe(true)
    await press(tree, 'Mostrar Ferrugem FC')
    expect(navigation.setParams).toHaveBeenLastCalledWith('teams', { teamId: 10 })
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: true })
    await press(tree, 'Mostrar Criar time')
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ x: step * 2, y: 0, animated: true })
    expect(host(tree, 'team-dot-active')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('abre já no time pedido (teamId) e rola até o cartão', async () => {
    serve()
    const tree = await mount({ teamId: 20 })
    expect(textOf(tree)).toContain('Time 2 de 2')
    expect(scroller.scrollTo).toHaveBeenCalledWith({ x: carouselMetrics(390).step, y: 0, animated: false })
    expect(calls().map(call => call[0])).toContain('/teams/20/members')
    expect(calls().map(call => call[0])).not.toContain('/teams/10/join-requests')
    await act(async () => { tree.unmount() })
  })

  it('sem time mostra o estado vazio com Criar time e Entrar com QR', async () => {
    serve(path => path === '/me/teams' ? { items: [] } : undefined)
    const tree = await mount()
    expect(textOf(tree)).toContain('Você ainda não tem time')
    // A placa não repete o quadro "Criar time" do carrossel: só o estado vazio oferece criar.
    expect(host(tree, 'team-slide-new')).toHaveLength(0)
    expect(byLabel(tree, 'Criar time')).toHaveLength(1)
    expect(byLabel(tree, 'Entrar com QR').length).toBeGreaterThan(0)
    await act(async () => { tree.unmount() })
  })

  it('erro ao carregar oferece tentar de novo; 401 expira a sessão', async () => {
    serve(path => { if (path === '/me/teams') throw new ApiError('Sem conexão.', 0); return undefined })
    const tree = await mount()
    expect(textOf(tree)).toContain('Sem conexão.')
    serve()
    await press(tree, 'Tentar novamente')
    expect(textOf(tree)).toContain('Ferrugem FC')
    serve(path => { if (path === '/me/teams') throw new ApiError('Sessão expirada.', 401); return undefined })
    await act(async () => { tree.unmount() })
    const expired = await mount()
    expect(onExpired).toHaveBeenCalled()
    await act(async () => { expired.unmount() })
  })

  it('"Seu time só tem você" leva a Convidar e a Link e QR', async () => {
    const alone = team(30, { name: 'Sozinho FC', member_count: 1, representative_count: 1 })
    serve(path => path === '/me/teams' ? { items: [alone] } : path === '/teams/30/members' ? { items: [mine] } : undefined)
    const tree = await mount()
    expect(textOf(tree)).toContain('Seu time só tem você')
    await press(tree, 'Convidar para o Sozinho FC')
    expect(navigation.go).toHaveBeenLastCalledWith('team-invite', { teamId: 30 })
    await press(tree, 'Link e QR do Sozinho FC')
    expect(navigation.go).toHaveBeenLastCalledWith('team-invite', { teamId: 30, link: true })
    await act(async () => { tree.unmount() })
  })
})

describe('Meus times: convites recebidos (faixa e folha K1)', () => {
  const invite = receivedInvite(9, team(40, { name: 'Tigres', my_role: null, member_count: 8 }), 'Jogamos às quintas, 20h.')

  it('a faixa avisa do convite; a folha mostra a mensagem e Aceitar põe o time no carrossel', async () => {
    let accepted = false
    serve((path, method, body) => {
      if (path === '/me/team-invites') return { items: accepted ? [] : [invite] }
      if (path === '/team-invites/9' && method === 'PUT') { expect(body).toEqual({ decision: 'aceitar' }); accepted = true; return { state: 'aceito', team: team(40, { name: 'Tigres', my_role: 'membro' }) } }
      return undefined
    })
    const tree = await mount()
    expect(textOf(tree)).toContain('Tigres')
    expect(byLabel(tree, 'Tigres convidou você. Abrir convites')).toHaveLength(1)
    await press(tree, 'Tigres convidou você. Abrir convites')
    expect(textOf(tree)).toContain('Convite para time')
    expect(textOf(tree)).toContain('Jogamos às quintas, 20h.')
    expect(textOf(tree)).toContain('Carlos Lima convidou você')
    await press(tree, 'Aceitar convite do Tigres')
    expect(calls()).toContainEqual(['/team-invites/9', 'PUT', { decision: 'aceitar' }])
    expect(textOf(tree)).toContain('Você entrou no Tigres.')
    expect(navigation.setParams).toHaveBeenCalledWith('teams', { teamId: 40 })
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('Recusar tira o convite; vários convites mostram o total na faixa e na folha', async () => {
    const second = receivedInvite(10, team(41, { name: 'Falcões', my_role: null }))
    serve((path, method) => {
      if (path === '/me/team-invites') return { items: [invite, second] }
      if (path === '/team-invites/9' && method === 'PUT') return { state: 'recusado', team: null }
      return undefined
    })
    const tree = await mount()
    expect(byLabel(tree, '2 convites para times. Abrir convites')).toHaveLength(1)
    await press(tree, '2 convites para times. Abrir convites')
    expect(textOf(tree)).toContain('Convites para times · 2')
    await press(tree, 'Recusar convite do Tigres')
    expect(textOf(tree)).toContain('Convite do Tigres recusado.')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('convite que deixou de valer (409) mostra o erro do servidor e recarrega a lista', async () => {
    let listed = 0
    serve((path, method) => {
      if (path === '/me/team-invites') { listed += 1; return { items: listed > 1 ? [] : [invite] } }
      if (path === '/team-invites/9' && method === 'PUT') throw new ApiError('Este convite não está mais pendente.', 409)
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Tigres convidou você. Abrir convites')
    await press(tree, 'Aceitar convite do Tigres')
    expect(textOf(tree)).toContain('Este convite não está mais pendente.')
    expect(listed).toBe(2)
    expect(textOf(tree)).toContain('Nenhum convite pendente.')
    await act(async () => { tree.unmount() })
  })

  it('a notificação de convite (params.invites) abre a folha e consome o pedido', async () => {
    serve(path => path === '/me/team-invites' ? { items: [invite] } : undefined)
    const tree = await mount({ invites: true })
    expect(textOf(tree)).toContain('Convite para time')
    expect(navigation.setParams).toHaveBeenCalledWith('teams', { invites: false })
    await act(async () => { tree.unmount() })
  })
})

describe('Meus times: folha do atleta', () => {
  it('Ver perfil empilha o perfil do atleta; o próprio atleta não tem Ver perfil', async () => {
    serve()
    const tree = await mount()
    await press(tree, memberLabel({}, 2))
    expect(textOf(tree)).toContain('@atleta.2')
    expect(textOf(tree)).toContain('Defesa · no time desde')
    await press(tree, 'Ver perfil')
    expect(navigation.go).toHaveBeenLastCalledWith('user-profile', { userId: 2 })
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await press(tree, 'Maria Souza · Goleiro · Representante · você')
    expect(byLabel(tree, 'Ver perfil')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('torna representante e tira a braçadeira, avisando e recarregando o elenco', async () => {
    serve((path, method, body) => {
      if (path === '/teams/10/members/2' && method === 'PATCH') return member(2, { role: (body as { role: 'membro' | 'representante' }).role })
      return undefined
    })
    const tree = await mount()
    await press(tree, memberLabel({}, 2))
    await press(tree, 'Tornar representante. Convida atletas, aprova pedidos e gere o elenco.')
    expect(calls()).toContainEqual(['/teams/10/members/2', 'PATCH', { role: 'representante' }])
    expect(textOf(tree)).toContain('Atleta2 agora é representante do Ferrugem FC.')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('mostra o erro do servidor quando a braçadeira é a do último representante e recarrega o time', async () => {
    const message = 'O time precisa de pelo menos um representante. Passe a braçadeira a outro atleta antes.'
    let loads = 0
    // O cartão ainda conta 2 representantes (a leitura está velha), mas o servidor sabe que sobrou um.
    const second = [mine, member(2, { role: 'representante' }), ...others.slice(1)]
    serve((path, method) => {
      if (path === '/me/teams') { loads += 1; return undefined }
      if (path === '/teams/10/members') return { items: second }
      if (path === '/teams/10/members/2' && method === 'PATCH') throw new ApiError(message, 409)
      return undefined
    })
    const tree = await mount()
    await press(tree, memberLabel({ role: 'representante' }, 2))
    await press(tree, 'Tirar a braçadeira de representante. Continua no elenco como membro.')
    expect(textOf(tree)).toContain(message)
    // A folha continua aberta com o erro e o time foi lido de novo.
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(1)
    expect(loads).toBe(2)
    await act(async () => { tree.unmount() })
  })

  it('o último representante tem a ação de tirar a braçadeira e a de sair desabilitadas, com a explicação', async () => {
    const sole = team(10, { name: 'Ferrugem FC', member_count: 12, representative_count: 1 })
    serve(path => path === '/me/teams' ? { items: [sole] } : undefined)
    const tree = await mount()
    await press(tree, 'Maria Souza · Goleiro · Representante · você')
    const takeOff = byLabel(tree, 'Tirar a braçadeira de representante. O time precisa de pelo menos um representante.')[0]
    expect(takeOff.props.accessibilityState.disabled).toBe(true)
    expect(byLabel(tree, 'Sair do time. Passe a braçadeira a outro atleta antes de sair, ou encerre o time em Editar time.')[0].props.accessibilityState.disabled).toBe(true)
    await act(async () => { tree.unmount() })
  })

  it('remove do time só depois da confirmação, com aviso e elenco recarregado', async () => {
    serve()
    const tree = await mount()
    await press(tree, memberLabel({}, 2))
    await press(tree, 'Remover do time')
    expect(textOf(tree)).toContain('Remover Atleta 2 Silva do Ferrugem FC?')
    expect(calls().some(call => call[1] === 'DELETE')).toBe(false)
    await press(tree, 'Cancelar')
    expect(textOf(tree)).not.toContain('Remover Atleta 2 Silva do Ferrugem FC?')
    await press(tree, 'Remover do time')
    await press(tree, 'Remover')
    expect(calls()).toContainEqual(['/teams/10/members/2', 'DELETE'])
    expect(textOf(tree)).toContain('Atleta 2 Silva foi removido do Ferrugem FC.')
    await act(async () => { tree.unmount() })
  })

  it('remover com 403 do servidor mostra o motivo na folha', async () => {
    serve((path, method) => { if (path === '/teams/10/members/2' && method === 'DELETE') throw new ApiError('Só representantes podem remover atletas.', 403); return undefined })
    const tree = await mount()
    await press(tree, memberLabel({}, 2))
    await press(tree, 'Remover do time')
    await press(tree, 'Remover')
    expect(textOf(tree)).toContain('Só representantes podem remover atletas.')
    await act(async () => { tree.unmount() })
  })

  it('membro sai do time com confirmação', async () => {
    serve()
    const tree = await mount()
    await press(tree, 'Sair do Leões do Cerrado')
    expect(textOf(tree)).toContain('Sair do Leões do Cerrado?')
    await press(tree, 'Sair do time')
    expect(calls()).toContainEqual(['/teams/20/members/1', 'DELETE'])
    expect(textOf(tree)).toContain('Você saiu do Leões do Cerrado.')
    await act(async () => { tree.unmount() })
  })
})

describe('Meus times: pedidos para entrar e convites enviados (representante)', () => {
  it('lista pedidos e convites; aprova e cancela com aviso', async () => {
    let approved = false
    serve((path, method) => {
      if (path === '/teams/10/join-requests') return { items: approved ? [] : [joinRequest(5, 10, 'Paulo Ramos')] }
      if (path === '/team-join-requests/5' && method === 'PUT') { approved = true; return joinRequest(5, 10, 'Paulo Ramos') }
      return undefined
    })
    const tree = await mount()
    expect(textOf(tree)).toContain('Pedidos para entrar · 1')
    expect(textOf(tree)).toContain('Paulo Ramos')
    expect(textOf(tree)).toContain('Convites enviados')
    expect(textOf(tree)).toContain('Rita Alves')
    await press(tree, 'Aprovar pedido de Paulo Ramos')
    expect(calls()).toContainEqual(['/team-join-requests/5', 'PUT', { decision: 'aprovar' }])
    expect(textOf(tree)).toContain('Paulo Ramos entrou no elenco.')
    expect(textOf(tree)).not.toContain('Pedidos para entrar')
    await press(tree, 'Cancelar convite de Rita Alves')
    expect(calls()).toContainEqual(['/team-invites/3', 'DELETE'])
    expect(textOf(tree)).toContain('Convite para Rita Alves cancelado.')
    await act(async () => { tree.unmount() })
  })

  it('recusa um pedido e trata o 409 recarregando', async () => {
    let decisions = 0
    serve((path, method) => {
      if (path === '/team-join-requests/5' && method === 'PUT') { decisions += 1; if (decisions === 1) return joinRequest(5, 10); throw new ApiError('Este pedido não está mais pendente.', 409) }
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Recusar pedido de Paulo Ramos')
    expect(textOf(tree)).toContain('Pedido de Paulo Ramos recusado.')
    expect(textOf(tree)).not.toContain('Pedidos para entrar')
    await act(async () => { tree.unmount() })
    const failing = await mount()
    serve((path, method) => { if (path === '/team-join-requests/5' && method === 'PUT') throw new ApiError('Este pedido não está mais pendente.', 409); return undefined })
    await press(failing, 'Aprovar pedido de Paulo Ramos')
    expect(textOf(failing)).toContain('Este pedido não está mais pendente.')
    await act(async () => { failing.unmount() })
  })

  it('a notificação de pedido (params.requests) rola até a seção e consome o pedido', async () => {
    serve()
    const tree = await mount({ requests: true })
    const layouts = tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onLayout === 'function')
    expect(layouts.length).toBeGreaterThanOrEqual(2)
    // Antes do layout da seção o pedido continua pendente.
    expect(navigation.setParams).not.toHaveBeenCalledWith('teams', { requests: false })
    await act(async () => { layouts[0].props.onLayout({ nativeEvent: { layout: { y: 300 } } }) })
    await act(async () => { layouts[1].props.onLayout({ nativeEvent: { layout: { y: 120 } } }) })
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ y: 412, animated: true })
    expect(navigation.setParams).toHaveBeenCalledWith('teams', { requests: false })
    await act(async () => { tree.unmount() })
  })
})

describe('Meus times: Entrar com QR', { timeout: 20000 }, () => {
  const camera = async () => (await import('expo-camera')).useCameraPermissions as unknown as ReturnType<typeof vi.fn>
  /** O leitor é carregado sob demanda (lazy): espera a montagem fora do act, que seguraria a renderização. */
  const openScanner = async (tree: ReactTestRenderer) => {
    await press(tree, 'Entrar com QR')
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) })
      expect(tree.root.findAll(node => typeof node.type === 'string' && (node.props.testID === 'qr-no-permission' || String(node.type) === 'CameraView'))).not.toHaveLength(0)
    }, { timeout: 12000 })
  }

  it('lê o QR do link do time com a câmera e abre a tela de entrada', async () => {
    ;(await camera()).mockReturnValue([{ granted: true, canAskAgain: true, status: 'granted' }, vi.fn()])
    serve()
    const tree = await mount()
    await openScanner(tree)
    const view = tree.root.findAllByType('CameraView' as never)[0]
    expect(view.props.barcodeScannerSettings).toEqual({ barcodeTypes: ['qr'] })
    await act(async () => { view.props.onBarcodeScanned({ data: 'https://arena.example.com/entrar/abc_123-XYZ' }) })
    expect(navigation.go).toHaveBeenLastCalledWith('join', { token: 'abc_123-XYZ' })
    expect(tree.root.findAllByType('CameraView' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('aceita o esquema do app e avisa de um QR que não é de time, sem sair da câmera', async () => {
    ;(await camera()).mockReturnValue([{ granted: true, canAskAgain: true, status: 'granted' }, vi.fn()])
    serve()
    const tree = await mount()
    await openScanner(tree)
    const view = () => tree.root.findAllByType('CameraView' as never)[0]
    await act(async () => { view().props.onBarcodeScanned({ data: 'https://outro-site.com/promo' }) })
    expect(textOf(tree)).toContain('Este QR não é de um time do Arena.')
    expect(navigation.go).not.toHaveBeenCalledWith('join', expect.anything())
    // A mesma leitura repetida pela câmera não reinicia o aviso, e um código válido segue normalmente.
    await act(async () => { view().props.onBarcodeScanned({ data: 'https://outro-site.com/promo' }) })
    await act(async () => { view().props.onBarcodeScanned({ data: 'arena://entrar/tok-1' }) })
    expect(navigation.go).toHaveBeenCalledTimes(1)
    expect(navigation.go).toHaveBeenLastCalledWith('join', { token: 'tok-1' })
    await act(async () => { tree.unmount() })
  })

  it('sem permissão mostra um estado honesto, pede a permissão e permite fechar', async () => {
    const request = vi.fn()
    ;(await camera()).mockReturnValue([{ granted: false, canAskAgain: true, status: 'undetermined' }, request])
    serve()
    const tree = await mount()
    await openScanner(tree)
    expect(textOf(tree)).toContain('Sem acesso à câmera')
    expect(tree.root.findAllByType('CameraView' as never)).toHaveLength(0)
    await press(tree, 'Permitir câmera')
    expect(request).toHaveBeenCalledOnce()
    await press(tree, 'Fechar leitor de QR')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })
})
