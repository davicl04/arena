import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Sport } from '../src/api/client'
import type { PlayBoard } from '../src/api/matchmaking'
import { brandSvgs } from '../src/assets/brand-svgs'
import type { PlayBoardState } from '../src/hooks/usePlayBoard'
import PlayScreen from '../src/screens/PlayScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { findToast, renderWithToasts, toasts, toastText, unmountToastTrees } from './support/toast'
import {
  athleteSide, brasilia, football, ferrugemRef, fromNow, leoesRef, matchCard, person, playBoard, proposal, search, slotOffer, standings,
  teamSide, tennis,
} from './support/play'
import { answer, fakeNavigation, me, TOKEN } from './support/teams'
import type { FakeNavigation, Handler } from './support/teams'
import { bests, lago, markCard } from './support/runs'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const running = { ...football, id: 3, sport: 'corrida' as const, position: null }

/** O que o servidor devolve em `GET /me/play`: cada teste muda `server.board` antes da ação que o altera. */
const server: { board: PlayBoard | null } = { board: null }
let navigation: FakeNavigation
let reloadSpy = vi.fn()
let deferSpy = vi.fn()
/** Relê a placa como o `usePlayBoard` a cada 15 s: a tela recebe o que `server.board` tem agora. */
let readBoard: () => Promise<PlayBoard | null> = async () => null
const onExpired = vi.fn()
const trees: ReactTestRenderer[] = []

interface Options { board?: PlayBoard | null; loading?: boolean; error?: string; hint?: number; sport?: Sport }

/** A tela como o shell a monta: `playBoard`/`refreshPlayBoard` do `usePlayBoard`, com a placa vinda de `server.board`. */
function Harness({ options }: { options: Options }) {
  const [board, setBoard] = useState<PlayBoard | null>(options.board === undefined ? server.board : options.board)
  const [params, setParams] = useState<{ matchId?: number; sport?: Sport } | undefined>(options.hint === undefined && options.sport === undefined ? undefined : { matchId: options.hint, sport: options.sport })
  const [deferred, setDeferred] = useState<number[]>([])
  const nav = useMemo(() => ({
    ...navigation,
    // `setParams` da pilha troca os parâmetros da tela atual: o espelho mantém o ciclo real (pedido da notificação consumido).
    setParams: (screen: 'play', patch: object) => { navigation.setParams(screen, patch); setParams(old => ({ ...old, ...patch })) },
  }), [])
  const reload = useCallback(async () => { reloadSpy(); setBoard(server.board); return server.board }, [])
  useEffect(() => { readBoard = reload }, [reload])
  const defer = useCallback((matchId: number) => { deferSpy(matchId); setDeferred(old => [...old, matchId]) }, [])
  const playBoardState: PlayBoardState = { board, loading: options.loading ?? false, error: options.error ?? '', reload, deferred, defer }
  return h(PlayScreen, { user: me, navigation: nav as never, onUser: vi.fn(), onLogout: vi.fn(), onExpired, playBoard: playBoardState, refreshPlayBoard: reload, params, title: 'Jogar' })
}

async function mount(board: PlayBoard | null = playBoard(), options: Omit<Options, 'board'> = {}): Promise<ReactTestRenderer> {
  server.board = board
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(Harness, { options: { board, ...options } })) })
  trees.push(tree)
  return tree
}

/** Rotas padrão: perfis de futebol e tênis, a cidade, o elo sem jogos e as marcas vazias; `extra` sobrepõe. */
function serve(extra: Handler = () => undefined, data = standings(), profiles = [football, tennis]) {
  vi.mocked(request).mockImplementation(answer(async (path, method, body) => {
    const custom = await extra(path, method, body)
    if (custom !== undefined) return custom
    if (path === '/me/sports-profiles') return profiles
    if (path === '/cities') return [brasilia]
    if (path === '/me/standings') return data
    if (path === '/me/run-bests') return bests()
    return undefined
  }))
}
const calls = (method: string) => vi.mocked(request).mock.calls.filter(call => (call[1] ?? 'GET') === method)
const lastCall = (method: string) => calls(method).at(-1)
const stateOf = (tree: ReactTestRenderer, label: string) => byLabel(tree, label).at(-1)?.props.accessibilityState
const host = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)
const has = (tree: ReactTestRenderer, text: string) => textOf(tree).includes(text)
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

beforeEach(() => {
  enableAct()
  navigation = fakeNavigation()
  reloadSpy = vi.fn()
  deferSpy = vi.fn()
  onExpired.mockReset()
  trees.length = 0
  server.board = null
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(TOKEN)
  vi.mocked(request).mockReset()
})
afterEach(async () => {
  await unmountToastTrees()
  for (const tree of trees) await act(async () => { tree.unmount() })
  vi.useRealTimers()
})

describe('Jogar: a placa', () => {
  it('mostra a cidade do perfil, as abas, o time e o formato; em classificação, sem brasão de elo', async () => {
    serve()
    const tree = await mount()
    expect(byLabel(tree, 'Modalidade')[0].props.accessibilityRole).toBe('tablist')
    expect(['Futebol', 'Tênis', 'Corrida'].map(name => stateOf(tree, name)?.selected)).toEqual([true, false, false])
    expect(has(tree, 'Brasília')).toBe(true)
    expect(has(tree, 'Ferrugem FC')).toBe(true)
    expect(has(tree, 'você representa')).toBe(true)
    expect(stateOf(tree, 'Society 7 contra 7')).toMatchObject({ checked: true })
    expect(stateOf(tree, 'Futsal 5 contra 5')).toMatchObject({ checked: false })
    expect(has(tree, 'Em classificação')).toBe(true)
    expect(has(tree, '0 de 3 partidas · enfrenta qualquer nível')).toBe(true)
    const emblems = tree.root.findAllByType('SvgXml' as never).filter(node => [brandSvgs.bronze, brandSvgs.prata, brandSvgs.ouro, brandSvgs.diamante, brandSvgs.lendario].includes(node.props.xml))
    expect(emblems).toHaveLength(0)
    const play = host(tree, 'play-button')[0]
    expect(play.props.accessibilityLabel).toBe('Encontrar partida')
    expect(play.props.disabled).toBe(false)
    expect(play.props.accessibilityHint).toBe('Times de Brasília de qualquer nível.')
    await press(tree, 'Cidade do perfil de Futebol: Brasília. Alterar em Suas modalidades')
    expect(navigation.go).toHaveBeenCalledWith('profile')
  })

  it('o formato escolhido muda a linha do elo; as abas trocam a modalidade', async () => {
    const data = standings()
    data.futebol.teams[0].formats[0] = { ...data.futebol.teams[0].formats[0], state: 'ranqueado', tier: 'ouro', played: 5, faces: ['prata', 'ouro', 'diamante'], faces_any_level: false }
    serve(() => undefined, data)
    const tree = await mount()
    await press(tree, 'Futsal 5 contra 5')
    expect(textOf(tree)).toContain('Enfrenta Prata, Ouro ou Diamante')
    expect(byLabel(tree, 'Elo Ouro. Enfrenta Prata, Ouro ou Diamante')).toHaveLength(1)
    expect(stateOf(tree, 'Futsal 5 contra 5')).toMatchObject({ checked: true })
    await press(tree, 'Tênis')
    expect(stateOf(tree, 'Tênis')).toMatchObject({ selected: true })
    expect(byLabel(tree, 'Formato')).toHaveLength(0)
    expect(host(tree, 'play-button')[0].props.accessibilityHint).toBe('Tenistas de Brasília de qualquer nível.')
  })

  it('a modalidade escolhida fica na entrada da pilha: ao voltar da partida a tela abre na mesma aba', async () => {
    serve()
    const first = await mount()
    expect(['Futebol', 'Tênis', 'Corrida'].map(name => stateOf(first, name)?.selected)).toEqual([true, false, false])
    await press(first, 'Tênis')
    expect(navigation.setParams).toHaveBeenLastCalledWith('play', { sport: 'tenis' })
    await press(first, 'Corrida')
    expect(navigation.setParams).toHaveBeenLastCalledWith('play', { sport: 'corrida' })
    // O shell remonta a tela com os parâmetros guardados.
    const again = await mount(playBoard(), { sport: 'tenis' })
    expect(['Futebol', 'Tênis', 'Corrida'].map(name => stateOf(again, name)?.selected)).toEqual([false, true, false])
  })

  it('sem perfil na modalidade o botão é PREPARAR e leva ao perfil, sem busca', async () => {
    serve(() => undefined, standings(), [football])
    const tree = await mount()
    await press(tree, 'Tênis')
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Preparar perfil de Tênis')
    expect(textOf(tree)).toContain('PREPARAR')
    expect(has(tree, 'Prepare seu perfil de tênis: o Arena usa a sua cidade para encontrar partidas perto de você.')).toBe(true)
    expect(byLabel(tree, 'Definir a cidade do perfil de Tênis')).toHaveLength(1)
    await press(tree, 'Preparar perfil de Tênis')
    expect(navigation.go).toHaveBeenCalledWith('profile')
    await press(tree, 'Corrida')
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Preparar perfil de Corrida')
    expect(has(tree, 'Prepare seu perfil de corrida')).toBe(true)
    expect(calls('POST')).toHaveLength(0)
  })

  it('sem time representado, leva a Meus times; o avulso continua disponível', async () => {
    serve(() => undefined, standings([]))
    const tree = await mount()
    expect(has(tree, 'Você ainda não representa um time.')).toBe(true)
    expect(byLabel(tree, 'Formato')).toHaveLength(0)
    await press(tree, 'Crie ou represente um time')
    expect(navigation.go).toHaveBeenCalledWith('teams')
    await press(tree, 'Avulso')
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Encontrar vaga')
  })

  it('membro de um time não o escolhe: só quem representa busca', async () => {
    serve(() => undefined, standings([{ team: leoesRef, role: 'membro' }, { team: ferrugemRef, role: 'representante' }]))
    const tree = await mount()
    expect(has(tree, 'Ferrugem FC')).toBe(true)
    expect(byLabel(tree, 'Time que você representa')).toHaveLength(0)
  })

  it('com mais de um time representado, escolhe o time por chips', async () => {
    serve(() => undefined, standings([{ team: ferrugemRef, role: 'representante' }, { team: leoesRef, role: 'representante' }]))
    const tree = await mount()
    expect(stateOf(tree, 'Ferrugem FC')).toMatchObject({ checked: true })
    await press(tree, 'Leões do Cerrado')
    expect(stateOf(tree, 'Leões do Cerrado')).toMatchObject({ checked: true })
    await press(tree, 'Encontrar partida')
    expect(has(tree, 'Leões do Cerrado · Em classificação')).toBe(true)
  })

  it('"Outras formas de jogar": Meu time e os campeonatos (ou provas) da modalidade', async () => {
    serve(() => undefined, standings(), [football, tennis, running])
    const tree = await mount()
    await press(tree, 'Meu time. Elenco, convites e pedidos para entrar')
    expect(navigation.go).toHaveBeenLastCalledWith('teams')
    await press(tree, 'Campeonatos. Campeonatos de futebol abertos, com inscrição pelo Arena')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'futebol' })
    await press(tree, 'Tênis')
    expect(byLabel(tree, 'Meu time. Elenco, convites e pedidos para entrar')).toHaveLength(0)
    await press(tree, 'Campeonatos. Campeonatos de tênis abertos, com inscrição pelo Arena')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'tenis' })
    await press(tree, 'Corrida')
    await press(tree, 'Provas. Provas de corrida abertas, com inscrição pelo Arena')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'corrida' })
  })
})

describe('Jogar: carregamento e erros', () => {
  it('mostra o carregamento das modalidades e da placa, sem botão ativo', async () => {
    serve(path => (path === '/me/sports-profiles' ? new Promise(() => undefined) : undefined))
    const tree = await mount(null, { loading: true })
    expect(has(tree, 'Carregando suas modalidades…')).toBe(true)
    expect(host(tree, 'play-button')[0].props.disabled).toBe(true)
  })

  it('placa que não carrega: mostra o erro, tenta de novo e não deixa buscar', async () => {
    serve()
    const tree = await mount(null, { error: 'Fora do ar' })
    expect(has(tree, 'Fora do ar')).toBe(true)
    expect(has(tree, 'Não foi possível carregar a placa do Jogar. Tente novamente.')).toBe(true)
    expect(host(tree, 'play-button')[0].props.disabled).toBe(true)
    server.board = playBoard()
    await press(tree, 'Tentar novamente')
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(has(tree, 'Fora do ar')).toBe(false)
    expect(host(tree, 'play-button')[0].props.disabled).toBe(false)
  })

  it('placa ainda carregando mostra o aviso', async () => {
    serve()
    const tree = await mount(null, { loading: true })
    expect(has(tree, 'Carregando a placa…')).toBe(true)
  })

  it('elo que não carrega: mensagem do servidor e tentar de novo', async () => {
    let fail = true
    serve(path => {
      if (path === '/me/standings' && fail) throw new ApiError('Serviço indisponível.', 500)
      return undefined
    })
    const tree = await mount()
    // Erro de carregamento (LoadError de seção, escuro), não toast.
    expect(host(tree, 'load-error-section')).toHaveLength(1)
    expect(has(tree, 'Serviço indisponível.')).toBe(true)
    expect(has(tree, 'Não foi possível carregar')).toBe(true)
    expect(toasts()).toEqual([])
    fail = false
    await press(tree, 'Tentar novamente')
    expect(has(tree, 'Serviço indisponível.')).toBe(false)
    expect(host(tree, 'load-error-section')).toHaveLength(0)
    expect(has(tree, '0 de 3 partidas')).toBe(true)
  })

  it('o elo que falha por conexão diz que está sem conexão, em vez da mensagem do servidor', async () => {
    serve(path => {
      if (path === '/me/standings') throw new ApiError('Sem resposta do servidor.', 503)
      return undefined
    })
    const tree = await mount()
    expect(has(tree, 'Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.')).toBe(true)
    expect(has(tree, 'Sem resposta do servidor.')).toBe(false)
    expect(host(tree, 'load-error-section')).toHaveLength(1)
  })

  it('modalidades que não carregam: erro e tentar de novo', async () => {
    let fail = true
    serve(path => {
      if (path === '/me/sports-profiles' && fail) throw new ApiError('Perfis indisponíveis.', 500)
      return undefined
    })
    const tree = await mount()
    expect(has(tree, 'Perfis indisponíveis.')).toBe(true)
    expect(host(tree, 'load-error-section').length).toBeGreaterThan(0)
    fail = false
    await press(tree, 'Tentar novamente')
    expect(has(tree, 'Perfis indisponíveis.')).toBe(false)
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Encontrar partida')
  })

  it('401 em qualquer leitura da placa chama onExpired', async () => {
    serve(path => {
      if (path === '/me/standings') throw new ApiError('Sessão expirada', 401)
      return undefined
    })
    await mount()
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('Jogar: preparar e iniciar a busca', () => {
  it('com o time completo: escolhe o formato na folha, busca e relê a placa', async () => {
    const active = search({ format: 'futsal', open_slots: null })
    serve((path, method) => (path === '/matchmaking/searches' && method === 'POST' ? { search: active, proposal: null, offer: null } : undefined))
    const tree = await mount()
    await press(tree, 'Encontrar partida')
    expect(has(tree, 'Preparar busca')).toBe(true)
    expect(has(tree, 'Ferrugem FC · Em classificação')).toBe(true)
    expect(stateOf(tree, 'O time está completo?')).toMatchObject({ checked: true })
    expect(byLabel(tree, 'Vagas para avulsos por posição')).toHaveLength(0)
    await press(tree, 'Futsal 5 contra 5')
    server.board = playBoard({ searches: [active] })
    await press(tree, 'Buscar adversário')
    expect(lastCall('POST')).toEqual(['/matchmaking/searches', 'POST', { sport: 'futebol', team_id: 10, format: 'futsal', team_complete: true, open_slots: null }])
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(has(tree, 'Preparar busca')).toBe(false)
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Buscando. Toque para cancelar a busca')
    expect(has(tree, 'BUSCANDO')).toBe(true)
  })

  it('com vagas para avulsos: contadores, limite de um goleiro e corpo com open_slots', async () => {
    const active = search()
    serve((path, method) => (path === '/matchmaking/searches' && method === 'POST' ? { search: active, proposal: null, offer: null } : undefined))
    const tree = await mount()
    await press(tree, 'Encontrar partida')
    await press(tree, 'O time está completo?')
    expect(stateOf(tree, 'O time está completo?')).toMatchObject({ checked: false })
    expect(byLabel(tree, 'Vagas para avulsos por posição')).toHaveLength(1)
    expect(has(tree, '0 de 6 vagas · no máximo 1 de goleiro')).toBe(true)
    // Sem nenhuma vaga aberta, o botão fica parado e explica.
    expect(byLabel(tree, 'Buscar adversário').at(-1)?.props.accessibilityState).toMatchObject({ disabled: true })
    expect(has(tree, 'Abra ao menos uma vaga ou marque o time como completo.')).toBe(true)
    const step = async (label: string, action: 'increment' | 'decrement') => {
      await act(async () => { byLabel(tree, label)[0].props.onAccessibilityAction({ nativeEvent: { actionName: action } }) })
    }
    await step('Vagas de goleiro', 'increment')
    await step('Vagas de goleiro', 'increment')
    expect(byLabel(tree, 'Vagas de goleiro')[0].props.accessibilityValue).toMatchObject({ now: 1, max: 1 })
    await step('Vagas de atacante', 'increment')
    await step('Vagas de defesa', 'increment')
    await step('Vagas de defesa', 'decrement')
    expect(has(tree, 'Buscar adversário · 2 vagas')).toBe(true)
    expect(has(tree, 'As vagas abrem para avulsos assim que a partida for agendada.')).toBe(true)
    server.board = playBoard({ searches: [active] })
    await press(tree, 'Buscar adversário')
    expect(lastCall('POST')?.[2]).toEqual({
      sport: 'futebol', team_id: 10, format: 'society', team_complete: false, open_slots: { goleiro: 1, defesa: 0, meio_campo: 0, atacante: 1 },
    })
    expect(has(tree, 'Preparar busca')).toBe(false)
  })

  it('o erro do servidor aparece no campo; os demais erros, na folha; 401 expira a sessão', async () => {
    let failure: Error = new ApiError('Dados inválidos.', 422, [{ field: 'open_slots', message: 'No society cabem até 6 vagas para avulsos.' }])
    serve((path, method) => {
      if (path === '/matchmaking/searches' && method === 'POST') throw failure
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Encontrar partida')
    await press(tree, 'O time está completo?')
    await act(async () => { byLabel(tree, 'Vagas de atacante')[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }) })
    await press(tree, 'Buscar adversário')
    expect(has(tree, 'No society cabem até 6 vagas para avulsos.')).toBe(true)
    expect(has(tree, 'Preparar busca')).toBe(true)
    failure = new ApiError('Escolha o formato da partida.', 422, [{ field: 'format', message: 'Escolha o formato da partida.' }])
    await press(tree, 'Buscar adversário')
    expect(has(tree, 'No society cabem')).toBe(false)
    expect(has(tree, 'Escolha o formato da partida.')).toBe(true)
    failure = new ApiError('Só representantes buscam partida para o time.', 403)
    await press(tree, 'Buscar adversário')
    expect(has(tree, 'Só representantes buscam partida para o time.')).toBe(true)
    failure = new ApiError('Sessão expirada', 401)
    await press(tree, 'Buscar adversário')
    expect(onExpired).toHaveBeenCalledOnce()
    // Fechar a folha desiste da busca.
    await press(tree, 'Fechar')
    expect(has(tree, 'Preparar busca')).toBe(false)
  })

  it('avulso busca direto, com a posição do perfil ou qualquer posição', async () => {
    const active = search({ kind: 'avulso', team: null, format: null, position: 'atacante', open_slots: null })
    serve((path, method) => (path === '/matchmaking/searches' && method === 'POST' ? { search: active, proposal: null, offer: null } : undefined))
    const tree = await mount()
    await press(tree, 'Avulso')
    expect(stateOf(tree, 'Avulso')).toMatchObject({ checked: true })
    expect(stateOf(tree, 'Atacante')).toMatchObject({ checked: true })
    expect(has(tree, 'Em classificação como atacante')).toBe(true)
    expect(host(tree, 'play-button')[0].props.accessibilityHint).toBe('Vagas de atacante em partidas de Brasília.')
    await press(tree, 'Qualquer posição')
    expect(has(tree, 'Em classificação')).toBe(true)
    await press(tree, 'Goleiro')
    server.board = playBoard({ searches: [{ ...active, position: 'goleiro' }] })
    await press(tree, 'Encontrar vaga')
    expect(lastCall('POST')).toEqual(['/matchmaking/searches', 'POST', { sport: 'futebol', position: 'goleiro' }])
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(stateOf(tree, 'Goleiro')).toMatchObject({ checked: true, disabled: true })
    await press(tree, 'Qualquer posição')
    expect(stateOf(tree, 'Goleiro')).toMatchObject({ checked: true })
  })

  it('tênis busca direto, sem time nem posição', async () => {
    const active = search({ kind: 'tenis', sport: 'tenis', team: null, format: null, open_slots: null })
    serve((path, method) => (path === '/matchmaking/searches' && method === 'POST' ? { search: active, proposal: null, offer: null } : undefined))
    const tree = await mount()
    await press(tree, 'Tênis')
    server.board = playBoard({ searches: [active] })
    await press(tree, 'Encontrar partida')
    expect(lastCall('POST')).toEqual(['/matchmaking/searches', 'POST', { sport: 'tenis' }])
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Buscando. Toque para cancelar a busca')
    // A busca de futebol do mesmo titular não aparece na aba do tênis, e vice-versa.
    await press(tree, 'Futebol')
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Encontrar partida')
  })

  it('erro ao buscar direto mostra a mensagem e deixa tentar de novo', async () => {
    serve((path, method) => {
      if (path === '/matchmaking/searches' && method === 'POST') throw new ApiError('Complete seu perfil de tênis com a cidade para buscar partidas.', 409)
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Tênis')
    await press(tree, 'Encontrar partida')
    expect(toastText()).toContain('Complete seu perfil de tênis com a cidade para buscar partidas.')
    expect(host(tree, 'play-button')[0].props.disabled).toBe(false)
  })

  it('a busca que já nasce com proposta abre a proposta depois de reler a placa', async () => {
    const paired = proposal()
    serve((path, method) => (path === '/matchmaking/searches' && method === 'POST'
      ? { search: search({ state: 'pareada', match_id: 50 }), proposal: paired, offer: null } : undefined))
    const tree = await mount()
    // A proposta nasce já aceita pelo outro lado: o servidor a devolve, e a folha abre mesmo depois de adiada.
    server.board = playBoard({ searches: [search({ state: 'pareada', match_id: 50 })], proposals: [paired] })
    await press(tree, 'Encontrar partida')
    await press(tree, 'Buscar adversário')
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
  })

  it('a busca que já nasce com oferta de vaga abre a oferta (avulso)', async () => {
    const offer = slotOffer()
    serve((path, method) => (path === '/matchmaking/searches' && method === 'POST'
      ? { search: search({ kind: 'avulso', team: null, format: null, position: 'atacante', state: 'pareada', slot_id: 9, offer_expires_at: offer.expires_at }), proposal: null, offer } : undefined))
    const tree = await mount()
    await press(tree, 'Avulso')
    server.board = playBoard({ searches: [search({ kind: 'avulso', team: null, format: null, position: 'atacante', state: 'pareada', slot_id: 9 })], offers: [offer] })
    await press(tree, 'Encontrar vaga')
    expect(has(tree, 'Vaga de atacante')).toBe(true)
    expect(has(tree, 'Quero jogar')).toBe(true)
  })
})

describe('Jogar: buscando e cancelar', () => {
  const active = (overrides = {}) => search({ started_at: fromNow(-0.05), ...overrides })

  it('mostra o tempo, trava o formato e a posição e a nota diz o que a busca encontra', async () => {
    serve()
    const tree = await mount(playBoard({ searches: [active()] }))
    const button = host(tree, 'play-button')[0]
    expect(button.props.accessibilityLabel).toBe('Buscando. Toque para cancelar a busca')
    expect(button.props.accessibilityValue).toEqual({ text: 'há 3 minutos' })
    expect(host(tree, 'play-elapsed')[0].props.children).toMatch(/^03:\d\d$/)
    expect(has(tree, 'BUSCANDO')).toBe(true)
    expect(has(tree, 'Times de Brasília de qualquer nível · Society. 2 vagas para avulsos: goleiro, atacante.')).toBe(true)
    expect(stateOf(tree, 'Society 7 contra 7')).toMatchObject({ checked: true, disabled: true })
    expect(byLabel(tree, 'Cancelar busca').length).toBeGreaterThan(0)
  })

  it('mostra o formato da busca em andamento mesmo que o da placa seja outro', async () => {
    serve()
    const tree = await mount(playBoard({ searches: [active({ format: 'campo' })] }))
    expect(stateOf(tree, 'Campo 11 contra 11')).toMatchObject({ checked: true })
  })

  it('"Continuar buscando" mantém a busca; "Cancelar busca" a encerra e avisa', async () => {
    serve((path, method) => (path === '/matchmaking/searches/55' && method === 'DELETE' ? null : undefined))
    const tree = await mount(playBoard({ searches: [active()] }))
    await press(tree, 'Buscando. Toque para cancelar a busca')
    expect(has(tree, 'Cancelar a busca?')).toBe(true)
    expect(has(tree, 'Você sai da fila e perde o tempo de espera. Dá para buscar de novo quando quiser.')).toBe(true)
    await press(tree, 'Continuar buscando')
    expect(has(tree, 'Cancelar a busca?')).toBe(false)
    expect(calls('DELETE')).toHaveLength(0)

    await press(tree, 'Cancelar busca')
    expect(has(tree, 'Cancelar a busca?')).toBe(true)
    server.board = playBoard()
    // Vários rótulos "Cancelar busca" (a ação da placa e o botão da folha): o último é o da folha.
    await press(tree, 'Cancelar busca')
    expect(lastCall('DELETE')).toEqual(['/matchmaking/searches/55', 'DELETE'])
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(has(tree, 'Cancelar a busca?')).toBe(false)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Busca cancelada.']])
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Encontrar partida')
    expect(byLabel(tree, 'Cancelar busca')).toHaveLength(0)
  })

  it('erro ao cancelar fica na folha; se a busca já foi pareada, a folha fecha e o erro vai à placa', async () => {
    serve((path, method) => {
      if (path === '/matchmaking/searches/55' && method === 'DELETE') throw new ApiError('A busca já encontrou uma partida. Responda à proposta.', 409)
      return undefined
    })
    const tree = await mount(playBoard({ searches: [active()] }))
    await press(tree, 'Cancelar busca')
    server.board = playBoard({ searches: [active()] })
    await press(tree, 'Cancelar busca')
    expect(toastText()).toContain('A busca já encontrou uma partida. Responda à proposta.')
    expect(has(tree, 'Cancelar a busca?')).toBe(true)
    server.board = playBoard({ searches: [active({ state: 'pareada', match_id: 50 })], proposals: [proposal({ can_respond: false })] })
    await press(tree, 'Cancelar busca')
    expect(has(tree, 'Cancelar a busca?')).toBe(false)
    expect(toastText()).toContain('A busca já encontrou uma partida. Responda à proposta.')
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Ver a proposta, que aguarda o adversário')
  })

  it('o membro vê a busca do time, mas não a cancela', async () => {
    serve()
    const tree = await mount(playBoard({ searches: [active({ can_cancel: false })] }))
    expect(host(tree, 'play-button')[0].props.disabled).toBe(true)
    expect(byLabel(tree, 'Cancelar busca')).toHaveLength(0)
  })

  it('a busca de um time que o titular não representa aparece como aviso', async () => {
    serve()
    const tree = await mount(playBoard({ searches: [
      search({ id: 90, team: leoesRef, can_cancel: false }),
      search({ id: 91, team: { ...leoesRef, id: 21, name: 'Tigres' }, state: 'pareada', can_cancel: false }),
    ] }))
    expect(has(tree, 'Leões do Cerrado está buscando partida. Só os representantes respondem.')).toBe(true)
    expect(has(tree, 'Tigres está buscando e encontrou um adversário. Só os representantes respondem.')).toBe(true)
    // Essas buscas não são as do titular: o botão continua livre.
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Encontrar partida')
  })
})

describe('Jogar: proposta', () => {
  it('abre sozinha; aceitar espera o outro lado e, quando os dois aceitam, abre a partida', async () => {
    const pending = proposal()
    const accepted = proposal({ sides: [teamSide('a', ferrugemRef, { is_mine: true, accepted_at: fromNow(0) }), teamSide('b', leoesRef, { tier: 'prata' })], can_respond: false })
    serve((path, method) => (path === '/matches/50/accept' && method === 'PUT' ? accepted : undefined))
    const tree = await mount(playBoard({ searches: [search({ state: 'pareada', match_id: 50 })], proposals: [pending] }))
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
    expect(byLabel(tree, 'Ferrugem FC, em classificação').length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Leões do Cerrado, elo Prata').length).toBeGreaterThan(0)
    expect(host(tree, 'countdown').length).toBeGreaterThan(0)
    expect(has(tree, 'para os representantes aceitarem')).toBe(true)
    expect(byLabel(tree, 'Aceitar partida')).toHaveLength(1)

    server.board = playBoard({ searches: [search({ state: 'pareada', match_id: 50 })], proposals: [accepted] })
    await press(tree, 'Aceitar partida')
    expect(lastCall('PUT')).toEqual(['/matches/50/accept', 'PUT', {}])
    expect(has(tree, 'Você aceitou')).toBe(true)
    expect(has(tree, 'Aguardando Leões do Cerrado')).toBe(true)
    expect(byLabel(tree, 'Aceitar partida')).toHaveLength(0)
    expect(navigation.go).not.toHaveBeenCalled()
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Ver a proposta, que aguarda o adversário')
    // Fechada a folha, o botão redondo a reabre.
    await press(tree, 'Fechar')
    expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
    await press(tree, 'Ver a proposta, que aguarda o adversário')
    expect(has(tree, 'Aguardando Leões do Cerrado')).toBe(true)
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)

    // O outro lado aceita: a proposta some da placa, a partida passa a existir e é para lá que a pessoa vai.
    server.board = playBoard({ matches: [matchCard({ id: 50 })] })
    await act(async () => { await readBoard() })
    expect(navigation.go).toHaveBeenCalledOnce()
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 50 })
  })

  it('aceitar com o outro lado já aceito vai direto à partida', async () => {
    serve((path, method) => (path === '/matches/50/accept' && method === 'PUT' ? proposal({ state: 'combinando', can_respond: false }) : undefined))
    const tree = await mount(playBoard({ proposals: [proposal()] }))
    server.board = playBoard({ matches: [matchCard({ id: 50 })] })
    await press(tree, 'Aceitar partida')
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 50 })
    expect(has(tree, 'Adversário encontrado')).toBe(false)
  })

  it('recusar chama a API, fecha a folha e avisa', async () => {
    serve((path, method) => (path === '/matches/50/decline' && method === 'PUT' ? proposal({ state: 'recusada', can_respond: false }) : undefined))
    const tree = await mount(playBoard({ proposals: [proposal()] }))
    server.board = playBoard()
    await press(tree, 'Recusar')
    expect(lastCall('PUT')).toEqual(['/matches/50/decline', 'PUT', {}])
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Proposta recusada.']])
    expect(navigation.go).not.toHaveBeenCalled()
  })

  it('"Responder depois" adia sem chamar a API; o cartão da placa reabre a folha', async () => {
    serve()
    const tree = await mount(playBoard({ proposals: [proposal()] }))
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
    await press(tree, 'Responder depois')
    expect(deferSpy).toHaveBeenCalledWith(50)
    expect(calls('PUT')).toHaveLength(0)
    expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['info', 'A proposta continua na placa e nas notificações até o prazo.']])
    // Adiada, a proposta não abre sozinha de novo, mas o cartão da placa a mostra.
    expect(host(tree, 'proposal-card')).toHaveLength(1)
    expect(has(tree, 'Os dois lados precisam aceitar em até 2 h. A proposta expira se ninguém responder.')).toBe(true)
    await press(tree, 'Responder à proposta')
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
    await press(tree, 'Fechar folha')
    expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
  })

  it('quem não age pelo lado só lê: membro vê "Só os representantes aceitam."; no tênis, "Só o atleta aceita a proposta."', async () => {
    serve()
    const tree = await mount(playBoard({ proposals: [proposal({ can_respond: false, my_role: 'membro' })] }))
    // Não abre sozinha (não há o que responder): o cartão da placa explica e leva à folha.
    expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
    expect(has(tree, 'Só os representantes aceitam.')).toBe(true)
    await press(tree, 'Ver proposta')
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
    expect(byLabel(tree, 'Aceitar partida')).toHaveLength(0)
    expect(byLabel(tree, 'Recusar')).toHaveLength(0)
    await press(tree, 'Fechar')
    expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
    expect(has(tree, 'A proposta continua na placa')).toBe(false)
    expect(deferSpy).toHaveBeenCalledWith(50)

    const athletes = [athleteSide('a', person(1, 'Ricardo Moura'), { is_mine: true }), athleteSide('b', person(2, 'Caio Ramos'))]
    const tennisTree = await mount(playBoard({ proposals: [proposal({ sport: 'tenis', format: null, can_respond: false, sides: athletes })] }))
    await press(tennisTree, 'Tênis')
    expect(has(tennisTree, 'Só o atleta aceita a proposta.')).toBe(true)
    await press(tennisTree, 'Ver proposta')
    expect(has(tennisTree, 'Adversário encontrado · Tênis')).toBe(true)
    expect(has(tennisTree, 'para os atletas aceitarem')).toBe(true)
    expect(has(tennisTree, 'Ricardo Moura')).toBe(true)
  })

  it('erro comum ao aceitar mostra a mensagem na folha e deixa responder de novo, sem reler a placa', async () => {
    serve((path, method) => {
      if (path === '/matches/50/accept' && method === 'PUT') throw new ApiError('Falha momentânea no servidor.', 500)
      return undefined
    })
    const tree = await mount(playBoard({ proposals: [proposal()] }))
    await press(tree, 'Aceitar partida')
    expect(has(tree, 'Falha momentânea no servidor.')).toBe(true)
    expect(byLabel(tree, 'Aceitar partida')[0].props.accessibilityState).toMatchObject({ disabled: false })
    expect(deferSpy).not.toHaveBeenCalled()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it.each([['Aceitar partida', 'accept', 409], ['Recusar', 'decline', 404]] as const)(
    'proposta que mudou ao responder (%s, %s): fecha a folha, avisa com a mensagem do servidor e relê a placa',
    async (label, route, status) => {
      serve((path, method) => {
        if (path === `/matches/50/${route}` && method === 'PUT') throw new ApiError('Esta proposta não está mais aberta.', status)
        return undefined
      })
      const tree = await mount(playBoard({ proposals: [proposal()] }))
      expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
      server.board = playBoard()
      await press(tree, label)
      expect(reloadSpy).toHaveBeenCalledOnce()
      expect(has(tree, 'Adversário encontrado · Society')).toBe(false)
      expect(toasts().map(item => [item.tone, item.title])).toEqual([['warning', 'Esta proposta não está mais aberta.']])
      expect(deferSpy).toHaveBeenCalledWith(50)
      expect(host(tree, 'proposal-card')).toHaveLength(0)
    })

  it('401 ao responder expira a sessão', async () => {
    serve((path, method) => {
      if (path === '/matches/50/decline' && method === 'PUT') throw new ApiError('Sessão expirada', 401)
      return undefined
    })
    const tree = await mount(playBoard({ proposals: [proposal()] }))
    await press(tree, 'Recusar')
    expect(onExpired).toHaveBeenCalledOnce()
  })

  it('o cartão da proposta já aceita mostra quem espera e só aparece na modalidade dela', async () => {
    serve()
    const accepted = proposal({ can_respond: false, sides: [teamSide('a', ferrugemRef, { is_mine: true, accepted_at: fromNow(-0.01) }), teamSide('b', leoesRef)] })
    const tree = await mount(playBoard({ searches: [search({ state: 'pareada', match_id: 50 })], proposals: [accepted] }))
    expect(host(tree, 'proposal-card')).toHaveLength(1)
    expect(has(tree, 'Você aceitou')).toBe(true)
    expect(has(tree, 'Aguardando Leões do Cerrado')).toBe(true)
    expect(has(tree, 'Os dois lados precisam aceitar')).toBe(false)
    expect(host(tree, 'play-button')[0].props.accessibilityHint).toBe('Você aceitou a proposta. Falta o adversário responder, em até 2 h.')
    await press(tree, 'Tênis')
    expect(host(tree, 'proposal-card')).toHaveLength(0)
  })
})

describe('Jogar: oferta de vaga', () => {
  it('mostra o cartão no futebol e abre a folha com a partida, a posição e o prazo', async () => {
    serve()
    const tree = await mount(playBoard({ searches: [search({ kind: 'avulso', team: null, format: null, position: 'atacante', state: 'pareada', slot_id: 9 })], offers: [slotOffer()] }))
    expect(host(tree, 'slot-offer-card')).toHaveLength(1)
    expect(has(tree, 'Leões do Cerrado × Ferrugem FC')).toBe(true)
    expect(has(tree, 'Você joga como atacante convidado, só nesta partida')).toBe(true)
    await press(tree, 'Ver vaga')
    expect(has(tree, 'Vaga encontrada · Society')).toBe(true)
    expect(has(tree, 'Vaga de atacante')).toBe(true)
    expect(has(tree, 'Arena Sudoeste')).toBe(true)
    expect(has(tree, 'Leões do Cerrado abriu esta vaga. Você joga como atacante convidado, só nesta partida.')).toBe(true)
    expect(has(tree, 'para responder')).toBe(true)
    await press(tree, 'Responder depois')
    expect(has(tree, 'Vaga encontrada · Society')).toBe(false)
    // No Avulso, o botão redondo responde à oferta e reabre a folha.
    await press(tree, 'Avulso')
    expect(host(tree, 'play-button')[0].props.accessibilityLabel).toBe('Responder à oferta de vaga')
    await press(tree, 'Responder à oferta de vaga')
    expect(has(tree, 'Vaga encontrada · Society')).toBe(true)
    await press(tree, 'Responder depois')
    await press(tree, 'Tênis')
    expect(host(tree, 'slot-offer-card')).toHaveLength(0)
  })

  it('"Quero jogar" preenche a vaga e abre a partida', async () => {
    serve((path, method) => (path === '/match-slots/9/accept' && method === 'PUT' ? { id: 60 } : undefined))
    const tree = await mount(playBoard({ offers: [slotOffer()] }))
    await press(tree, 'Ver vaga')
    server.board = playBoard({ matches: [matchCard({ id: 60 })] })
    await press(tree, 'Quero jogar')
    expect(lastCall('PUT')).toEqual(['/match-slots/9/accept', 'PUT', {}])
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 60 })
    expect(reloadSpy).toHaveBeenCalledOnce()
    expect(has(tree, 'Vaga encontrada · Society')).toBe(false)
  })

  it('"Agora não" recusa, avisa e encerra a busca', async () => {
    serve((path, method) => (path === '/match-slots/9/decline' && method === 'PUT' ? null : undefined))
    const tree = await mount(playBoard({ offers: [slotOffer()] }))
    await press(tree, 'Ver vaga')
    server.board = playBoard()
    await press(tree, 'Agora não')
    expect(lastCall('PUT')).toEqual(['/match-slots/9/decline', 'PUT', {}])
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['info', 'Vaga recusada. Sua busca terminou.']])
    expect(has(tree, 'Vaga encontrada')).toBe(false)
    expect(navigation.go).not.toHaveBeenCalled()
  })

  it.each([['Quero jogar', 409, 'Esta vaga não está mais reservada para você.'], ['Agora não', 404, 'O prazo para aceitar esta vaga acabou.']] as const)(
    'oferta que mudou ao responder (%s, %s): fecha a folha, avisa com a mensagem do servidor e relê a placa',
    async (label, status, message) => {
      serve((path, method) => {
        if (path.startsWith('/match-slots/9') && method === 'PUT') throw new ApiError(message, status)
        return undefined
      })
      const tree = await mount(playBoard({ offers: [slotOffer()] }))
      await press(tree, 'Ver vaga')
      server.board = playBoard()
      await press(tree, label)
      expect(reloadSpy).toHaveBeenCalledOnce()
      expect(has(tree, 'Vaga encontrada · Society')).toBe(false)
      expect(toasts().map(item => [item.tone, item.title])).toEqual([['warning', message]])
      expect(host(tree, 'slot-offer-card')).toHaveLength(0)
    })

  it('"Responder depois" fecha sem chamar a API; erro comum fica na folha e 401 expira a sessão', async () => {
    let failure: Error | null = new ApiError('Falha momentânea no servidor.', 500)
    serve((path, method) => {
      if (path.startsWith('/match-slots/9') && method === 'PUT' && failure) throw failure
      return undefined
    })
    const tree = await mount(playBoard({ offers: [slotOffer()] }))
    await press(tree, 'Ver vaga')
    await press(tree, 'Quero jogar')
    expect(has(tree, 'Falha momentânea no servidor.')).toBe(true)
    failure = new ApiError('Não foi possível recusar agora.', 500)
    await press(tree, 'Agora não')
    expect(has(tree, 'Não foi possível recusar agora.')).toBe(true)
    expect(reloadSpy).not.toHaveBeenCalled()
    failure = new ApiError('Sessão expirada', 401)
    await press(tree, 'Quero jogar')
    expect(onExpired).toHaveBeenCalledOnce()
    await press(tree, 'Responder depois')
    expect(has(tree, 'Vaga encontrada · Society')).toBe(false)
    expect(host(tree, 'slot-offer-card')).toHaveLength(1)
  })
})

describe('Jogar: abrir pela notificação (matchId)', () => {
  it('abre a proposta daquela partida e consome o pedido', async () => {
    serve()
    const tree = await mount(playBoard({ proposals: [proposal({ match_id: 77 }), proposal({ match_id: 50, can_respond: false })] }), { hint: 50 })
    expect(has(tree, 'Adversário encontrado · Society')).toBe(true)
    // A proposta pedida abre, mesmo sem poder respondê-la, e não a primeira da lista.
    expect(byLabel(tree, 'Aceitar partida')).toHaveLength(0)
    await press(tree, 'Fechar')
    expect(navigation.setParams).toHaveBeenCalledWith('play', { matchId: undefined })
    expect(navigation.go).not.toHaveBeenCalled()
  })

  it('abre a oferta de vaga daquela partida', async () => {
    serve()
    const tree = await mount(playBoard({ offers: [slotOffer()] }), { hint: 60 })
    expect(has(tree, 'Vaga encontrada · Society')).toBe(true)
    await press(tree, 'Responder depois')
    expect(navigation.setParams).toHaveBeenCalledWith('play', { matchId: undefined })
    expect(has(tree, 'Vaga encontrada · Society')).toBe(false)
  })

  it('sem proposta nem oferta pendente, abre a própria partida; antes de ler a placa, espera', async () => {
    serve()
    await mount(null, { loading: true, hint: 55 })
    expect(navigation.go).not.toHaveBeenCalled()
    await mount(playBoard({ matches: [matchCard({ id: 55 })] }), { hint: 55 })
    expect(navigation.setParams).toHaveBeenCalledWith('play', { matchId: undefined })
    expect(navigation.go).toHaveBeenCalledOnce()
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 55 })
  })

  it('proposta já encerrada mostra o estado; confirmada leva à partida', async () => {
    serve()
    const closed = await mount(playBoard({ proposals: [proposal({ state: 'recusada', can_respond: false })] }), { hint: 50 })
    expect(has(closed, 'Proposta encerrada · Society')).toBe(true)
    expect(has(closed, 'A proposta foi recusada.')).toBe(true)
    await press(closed, 'Fechar')
    const confirmed = await mount(playBoard({ proposals: [proposal({ state: 'combinando', can_respond: false })] }), { hint: 50 })
    expect(has(confirmed, 'Partida confirmada · Society')).toBe(true)
    await press(confirmed, 'Abrir partida')
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 50 })
    const expired = await mount(playBoard({ proposals: [proposal({ state: 'expirada', can_respond: false })] }), { hint: 50 })
    expect(has(expired, 'O prazo da proposta terminou.')).toBe(true)
  })
})

describe('Jogar: minhas partidas', () => {
  const upcoming = [
    matchCard({ id: 50, needs_my_action: true }),
    matchCard({ id: 51, state: 'agendada', phase: 'agendada', starts_at: later(60 * 48), court: { id: 7, name: 'Arena Sudoeste', address: null, kind: 'society', city: brasilia, state: 'publicada', provisional: false } }),
    matchCard({ id: 52, sport: 'tenis', format: null, sides: [athleteSide('a', person(1, 'Ricardo Moura'), { is_mine: true }), athleteSide('b', person(2, 'Caio Ramos'))] }),
  ]

  it('lista as partidas da modalidade, com a fase e "Sua vez", e o toque abre a partida', async () => {
    serve()
    const tree = await mount(playBoard({ matches: upcoming }))
    const rows = host(tree, 'match-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].props.accessibilityLabel).toBe('Ferrugem FC × Leões do Cerrado, Data e quadra a combinar no chat, Combinando, sua vez')
    expect(rows[1].props.accessibilityLabel).toContain('Arena Sudoeste, Agendada')
    expect(has(tree, 'Sua vez')).toBe(true)
    await press(tree, rows[1].props.accessibilityLabel)
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 51 })
    await press(tree, 'Tênis')
    expect(host(tree, 'match-row')).toHaveLength(1)
    expect(host(tree, 'match-row')[0].props.accessibilityLabel).toContain('Ricardo Moura × Caio Ramos')
  })

  it('sem partidas, o estado vazio diz como começar; a corrida não mostra a lista', async () => {
    serve(() => undefined, standings(), [football, tennis, running])
    const tree = await mount(playBoard())
    expect(has(tree, 'Nenhuma partida em andamento. Encontre um adversário para começar.')).toBe(true)
    await press(tree, 'Corrida')
    expect(has(tree, 'MINHAS PARTIDAS')).toBe(false)
  })

  it('histórico: lê só ao abrir, filtra pela modalidade, pagina e mostra o vazio', async () => {
    const closed = (id: number, extra = {}) => matchCard({ id, state: 'encerrada', phase: 'encerrada', score: { a: 3, b: 1, sets: null, winner: 'a' }, starts_at: later(-60 * 24 * 3), ...extra })
    const first = { items: [closed(70), closed(71, { sport: 'tenis', format: null })], next_cursor: 'abc' }
    const second = { items: [closed(72, { state: 'cancelada', phase: 'cancelada', score: null })], next_cursor: null }
    serve((path, method) => {
      if (path === '/me/matches?scope=historico') return first
      if (path === '/me/matches?scope=historico&cursor=abc' && method === undefined) return second
      return undefined
    })
    const tree = await mount()
    expect(calls('GET').some(call => String(call[0]).startsWith('/me/matches'))).toBe(false)
    await press(tree, 'Histórico')
    const rows = host(tree, 'match-row')
    expect(rows.map(row => row.props.accessibilityLabel.includes('Placar 3 × 1'))).toEqual([true])
    expect(rows[0].props.accessibilityLabel).toContain('Encerrada')
    await press(tree, 'Carregar mais')
    expect(host(tree, 'match-row')).toHaveLength(2)
    expect(host(tree, 'match-row')[1].props.accessibilityLabel).toContain('Cancelada')
    expect(byLabel(tree, 'Carregar mais')).toHaveLength(0)
    await press(tree, 'Próximas')
    expect(has(tree, 'Nenhuma partida em andamento')).toBe(true)
    await press(tree, 'Tênis')
    await press(tree, 'Histórico')
    expect(host(tree, 'match-row')).toHaveLength(1)
  })

  it('histórico vazio e com erro (que tenta de novo); erro ao carregar mais', async () => {
    let mode: 'erro' | 'vazio' | 'mais' = 'erro'
    serve((path, method) => {
      if (path === '/me/matches?scope=historico') {
        if (mode === 'erro') throw new ApiError('Histórico indisponível.', 500)
        if (mode === 'mais') return { items: [matchCard({ id: 70, state: 'encerrada', phase: 'encerrada' })], next_cursor: 'abc' }
        return { items: [], next_cursor: null }
      }
      if (path.endsWith('cursor=abc') && method === undefined) throw new ApiError('Não foi possível carregar mais itens.', 500)
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Histórico')
    expect(has(tree, 'Histórico indisponível.')).toBe(true)
    mode = 'vazio'
    await press(tree, 'Tentar novamente')
    expect(has(tree, 'Suas partidas encerradas, sem resultado ou canceladas aparecem aqui.')).toBe(true)
    mode = 'mais'
    await press(tree, 'Próximas')
    await press(tree, 'Histórico')
    await press(tree, 'Carregar mais')
    expect(has(tree, 'Não foi possível carregar mais itens.')).toBe(true)
    expect(host(tree, 'match-row')).toHaveLength(1)
  })
})

describe('Jogar: corrida', () => {
  it('mostra a linha do elo da distância, o registro da corrida e as marcas, sem botão redondo de busca', async () => {
    const withMark = bests(markCard(10, ['52:40'], { best: { ...markCard(10, ['52:40']).best!, origin: lago } }))
    serve(path => (path === '/me/run-bests' ? withMark : undefined), standings(), [football, tennis, running])
    const tree = await mount()
    await press(tree, 'Corrida')
    expect(stateOf(tree, '5 km')).toMatchObject({ checked: true })
    expect(has(tree, 'Sem marca nos 5 km')).toBe(true)
    expect(has(tree, 'Registre um treino ou prova para entrar no ranking')).toBe(true)
    // No lugar do botão redondo, o registro da corrida e, abaixo da placa, as marcas.
    expect(byLabel(tree, 'Registrar corrida')).toHaveLength(1)
    expect(has(tree, 'Suas marcas')).toBe(true)
    expect(host(tree, 'play-button')).toHaveLength(0)
    await press(tree, '10 km')
    expect(has(tree, 'Ouro nos 10 km')).toBe(true)
    expect(has(tree, 'Melhor 52:40 · Corrida do Lago')).toBe(true)
    expect(has(tree, 'PROVAS')).toBe(true)
    await press(tree, 'Provas. Provas de corrida abertas, com inscrição pelo Arena')
    expect(navigation.go).toHaveBeenLastCalledWith('events', { sport: 'corrida' })
    expect(calls('POST')).toHaveLength(0)
  })

  it('as marcas que não carregam mostram o erro e tentam de novo', async () => {
    let fail = true
    serve(path => {
      if (path === '/me/run-bests' && fail) throw new ApiError('Marcas indisponíveis.', 500)
      return undefined
    }, standings(), [football, tennis, running])
    const tree = await mount()
    await press(tree, 'Corrida')
    expect(has(tree, 'Marcas indisponíveis.')).toBe(true)
    expect(host(tree, 'load-error-section').length).toBeGreaterThan(0)
    fail = false
    await press(tree, 'Tentar novamente')
    expect(has(tree, 'Sem marca nos 5 km')).toBe(true)
  })
})

describe('Jogar: acessibilidade', () => {
  it('tudo que é tocável tem papel e nome, e os alvos têm 44 pt ou mais', async () => {
    serve()
    // A proposta abre sozinha: a placa e a folha aparecem juntas.
    const tree = await mount(playBoard({ proposals: [proposal()], offers: [slotOffer()], matches: [matchCard()] }))
    const touchables = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessible !== false)
    expect(touchables.length).toBeGreaterThan(15)
    for (const node of touchables) {
      expect(node.props.accessibilityRole, String(node.props.accessibilityLabel)).toBeTruthy()
      expect(node.props.accessibilityLabel, String(node.props.accessibilityRole)).toBeTruthy()
    }
    const small = touchables.filter(node => {
      const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style
      return !(style?.minHeight >= 44 || style?.height >= 44)
    })
    // Só o fundo da folha, que cobre a tela inteira, não tem altura mínima.
    expect(small.map(node => node.props.accessibilityLabel)).toEqual(['Fechar folha'])
  })

  it('a confirmação sai pelo viewport de toasts (o anúncio é dele), sem região viva vazia fixa na tela', async () => {
    serve((path, method) => (path === '/matchmaking/searches/55' && method === 'DELETE' ? null : undefined))
    const viewport = await renderWithToasts(h('View'))
    const tree = await mount(playBoard({ searches: [search({ started_at: fromNow(-0.05) })] }))
    const live = tree.root.findAll(node => String(node.type) === 'Text' && node.props.accessibilityLiveRegion === 'polite' && node.props.children === '')
    expect(live).toHaveLength(0)
    await press(tree, 'Buscando. Toque para cancelar a busca')
    server.board = playBoard()
    await press(tree, 'Cancelar busca')
    const card = findToast(viewport, 'Busca cancelada.')
    expect(card?.props.testID).toBe('toast-success')
  })
})
