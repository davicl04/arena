import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { MatchDetail } from '../src/api/matches'
import { reportToInput, justificationOk } from '../src/components/organizer/DecisionForm'
import ResultDecisionScreen, { timelineOf } from '../src/screens/ResultDecisionScreen'
import { enableAct } from './support/native'
import { toastText } from './support/toast'
import { athleteSide, fromNow, matchDetail, matchEvent, message, messagePage, noPermissions, sides } from './support/play'
import { ana, beatriz, hiddenReport, report, result, score } from './support/results'
import { allText, bodyOf, byId, callsTo, findButton, isDisabled, labelled, navigationMock, pressButton, render, serve, typeInto } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Decisão do organizador (D3): a linha do tempo, o trecho do chat, a escolha entre os placares informados, outro placar ou
 * W.O. (grupo de rádio acessível) e a justificativa obrigatória. O servidor decide se vale; ao registrar, a tela volta.
 */

const h = React.createElement
const MATCH = '/matches/7'
const CHAT = '/matches/7/messages?limit=20'
const DECIDE = '/organizer/matches/7/result-decision'
const trees: ReactTestRenderer[] = []
const onExpired = vi.fn()
let navigation = navigationMock()

afterEach(async () => { for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })
beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

const organizer = { ...noPermissions, read_chat: true, decide_result: true }
/** Ferrugem FC (lado A) contra Leões do Cerrado (lado B), vistos pelo organizador, depois do início. */
const divergent = (overrides: Partial<MatchDetail> = {}) => matchDetail({
  id: 7, origin: 'campeonato', my_side: null, my_role: 'organizador', event: { id: 5, name: 'Copa Sudoeste' }, round_number: 1, sides: sides({ is_mine: false }),
  state: 'agendada', phase: 'divergente', starts_at: fromNow(-3), permissions: organizer,
  result: result({ state: 'divergente', reports: { a: report('a', 2, 1), b: report('b', 1, 2) } }), ...overrides,
})
async function mount(detail: MatchDetail = divergent(), extra: Record<string, unknown> = {}) {
  serve({ [MATCH]: detail, [CHAT]: messagePage([]), ...extra })
  const tree = await render(h(ResultDecisionScreen, { params: { matchId: 7 }, navigation, onExpired, title: 'Decidir resultado' } as never))
  trees.push(tree)
  return tree
}
const radio = (tree: ReactTestRenderer, label: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)[0]
/** As opções do grupo de rádio (só os nós nativos: a simulação repete cada componente). */
const options = (tree: ReactTestRenderer, group: string) => labelled(tree, group)[0].findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
const choose = async (tree: ReactTestRenderer, label: string) => {
  const target = radio(tree, label)
  expect(target, `opção "${label}"`).toBeTruthy()
  await act(async () => { target.props.onPress() })
}
const step = async (tree: ReactTestRenderer, label: string, times = 1, action: 'increment' | 'decrement' = 'increment') => {
  const target = labelled(tree, label)[0]
  expect(target, `contador "${label}"`).toBeTruthy()
  for (let index = 0; index < times; index++) await act(async () => { target.props.onAccessibilityAction({ nativeEvent: { actionName: action } }) })
}
const justify = (tree: ReactTestRenderer, text = 'O vídeo mostra o gol antes do apito final.') => typeInto(tree, 'Justificativa (obrigatória)', text)

describe('linha do tempo e chat', () => {
  it('mostra o jogo, os dois envios (quem e quando) e a divergência', async () => {
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Copa Sudoeste')
    expect(text).toContain('Placar divergente')
    expect(labelled(tree, 'Ferrugem FC contra Leões do Cerrado')).toHaveLength(1)
    const timeline = labelled(tree, 'Linha do tempo da partida')[0]
    expect(timeline).toBeTruthy()
    expect(labelled(tree, 'Linha do tempo da partida')[0].findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Partida jogada. '))).not.toHaveLength(0)
    expect(text).toContain('Ferrugem FC informou 2 × 1')
    expect(text).toContain('Leões do Cerrado informou 1 × 2')
    expect(text).toContain('Caio Ramos')
    expect(text).toContain('Rafa Nunes')
    expect(text).toContain('Placares diferentes')
    expect(text).toContain('A partida aguarda a sua decisão')
  })

  it('a linha do tempo pura: sem envio, prazo vencido e relato cego', () => {
    const none = divergent({ result: result({ reports: { a: null, b: null }, deadline: fromNow(-1) }), phase: 'informar_resultado' })
    expect(timelineOf(none).map(item => item.title)).toEqual(['Partida jogada', 'Ferrugem FC não informou o placar', 'Leões do Cerrado não informou o placar', 'Prazo de 48 h vencido'])
    const blind = divergent({ result: result({ reports: { a: null, b: hiddenReport('b') } }) })
    expect(timelineOf(blind).map(item => item.title)).toContain('Leões do Cerrado informou o placar')
    expect(timelineOf(divergent({ result: null, state: 'agendada' }))[0].title).toBe('Partida agendada')
    expect(timelineOf(divergent({ starts_at: null }))[0].detail).toBe('Sem data')
  })

  it('o trecho do chat tem as três últimas mensagens, com a etiqueta do organizador, e "Abrir chat" leva à partida', async () => {
    const chat = messagePage([
      message(1, { body: 'Mensagem antiga' }), matchEvent(2, 'resultado_divergente', 'Faixa do sistema'),
      message(3, { body: 'Bola entrou antes do apito.', author: { id: 11, name: 'Caio Ramos', username: 'caio', avatar_url: null } }),
      message(4, { body: 'Não entrou.', side: 'a', author: { id: 12, name: 'Tiago Melo', username: 'tiago', avatar_url: null } }),
      message(5, { body: 'Vou ver o vídeo.', side: null, author_role: 'organizador', author: { id: 21, name: 'Rafa Nunes', username: 'rafa', avatar_url: null } }),
      message(6, { body: null, removed: true }),
    ])
    const tree = await mount(divergent(), { [CHAT]: chat })
    const text = allText(tree)
    expect(text).toContain('No chat da partida')
    expect(text).toContain('Bola entrou antes do apito.')
    expect(text).toContain('Não entrou.')
    expect(text).toContain('Vou ver o vídeo.')
    expect(text).not.toContain('Mensagem antiga')
    expect(text).not.toContain('Faixa do sistema')
    expect(text).toContain('Rafa Nunes · Organizador')
    expect(byId(tree, 'chat-excerpt')).toHaveLength(1)
    await pressButton(tree, 'Abrir chat')
    expect(navigation.go).toHaveBeenCalledWith('match', { matchId: 7 })
  })

  it('chat vazio e sem permissão de leitura', async () => {
    const empty = await mount()
    expect(allText(empty)).toContain('Ainda não há mensagens no chat desta partida.')
    const closed = await mount(divergent({ permissions: { ...organizer, read_chat: false } }))
    expect(allText(closed)).not.toContain('No chat da partida')
    expect(callsTo('GET', CHAT)).toHaveLength(1)
  })
})

describe('decisão', () => {
  it('as opções são um grupo de rádio acessível; só a escolhida está marcada', async () => {
    const tree = await mount()
    expect(labelled(tree, 'Como decidir o resultado')[0].props.accessibilityRole).toBe('radiogroup')
    const choices = options(tree, 'Como decidir o resultado')
    expect(choices.map(node => node.props.accessibilityLabel)).toEqual([
      'Placar informado por Ferrugem FC: 2 × 1', 'Placar informado por Leões do Cerrado: 1 × 2', 'Outro placar', 'W.O., um lado não compareceu',
    ])
    expect(choices.every(node => node.props.accessibilityState.checked === false)).toBe(true)
    await choose(tree, 'Outro placar')
    expect(radio(tree, 'Outro placar').props.accessibilityState).toMatchObject({ checked: true })
    expect(radio(tree, 'W.O., um lado não compareceu').props.accessibilityState).toMatchObject({ checked: false })
  })

  it('um dos placares informados, com a justificativa de pelo menos 5 caracteres, e volta ao registrar', async () => {
    const tree = await mount(divergent(), { [`POST ${DECIDE}`]: divergent({ state: 'encerrada', phase: 'encerrada' }) })
    await choose(tree, 'Placar informado por Ferrugem FC: 2 × 1')
    expect(allText(tree)).toContain('Escolhido')
    expect(findButton(tree, 'Registrar 2 × 1')).toBeTruthy()
    await pressButton(tree, 'Registrar 2 × 1')
    // Sem justificativa: o formulário avisa e nada é enviado.
    expect(allText(tree)).toContain('Escreva a justificativa, de 5 a 500 caracteres.')
    expect(callsTo('POST', DECIDE)).toHaveLength(0)
    await justify(tree, 'abc')
    await pressButton(tree, 'Registrar 2 × 1')
    expect(callsTo('POST', DECIDE)).toHaveLength(0)
    await justify(tree, '  O vídeo mostra o gol antes do apito final.  ')
    expect(allText(tree)).toContain(`Fica registrada e os dois times veem. ${'O vídeo mostra o gol antes do apito final.'.length}/500`)
    await pressButton(tree, 'Registrar 2 × 1')
    expect(bodyOf('POST', DECIDE)).toEqual({ score: { goals_a: 2, goals_b: 1 }, justification: 'O vídeo mostra o gol antes do apito final.' })
    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('409 porque os times acertaram: relê a partida e o estado atual toma o lugar do formulário, com a mensagem do servidor', async () => {
    const message = 'O resultado desta partida já foi confirmado pelos times.'
    let reads = 0
    const settled = divergent({
      state: 'encerrada', phase: 'encerrada', permissions: { ...noPermissions, read_chat: true },
      result: result({ state: 'confirmado', final: score(2, 1), source: 'confirmacao', points: null }),
    })
    const tree = await mount(divergent(), { [MATCH]: () => (++reads === 1 ? divergent() : settled), [`POST ${DECIDE}`]: new ApiError(message, 409) })
    await choose(tree, 'Placar informado por Ferrugem FC: 2 × 1')
    await justify(tree)
    await pressButton(tree, 'Registrar 2 × 1')
    expect(callsTo('GET', MATCH)).toHaveLength(2)
    expect(navigation.back).not.toHaveBeenCalled()
    expect(toastText()).toContain(message)
    // O formulário some: não há mais o que decidir.
    expect(findButton(tree, 'Registrar 2 × 1')).toBeUndefined()
    expect(labelled(tree, 'Placar informado por Ferrugem FC: 2 × 1')).toHaveLength(0)
  })

  it('409 que ainda deixa decidir (o prazo mudou): relê e mantém o formulário com o que foi escrito e a mensagem', async () => {
    const message = 'Os times ainda podem corrigir o placar até o fim do prazo.'
    const tree = await mount(divergent(), { [`POST ${DECIDE}`]: new ApiError(message, 409) })
    await choose(tree, 'Placar informado por Ferrugem FC: 2 × 1')
    await justify(tree)
    await pressButton(tree, 'Registrar 2 × 1')
    expect(callsTo('GET', MATCH)).toHaveLength(2)
    expect(toastText()).toContain(message)
    expect(findButton(tree, 'Registrar 2 × 1')).toBeTruthy()
    expect(navigation.back).not.toHaveBeenCalled()
  })

  it('o outro placar usa os contadores de gols dos dois lados', async () => {
    const tree = await mount(divergent(), { [`POST ${DECIDE}`]: divergent({ state: 'encerrada' }) })
    await choose(tree, 'Outro placar')
    expect(allText(tree)).toContain('Registrar 0 × 0')
    await step(tree, 'Gols do Ferrugem FC', 3)
    await step(tree, 'Gols do Leões do Cerrado', 2)
    await step(tree, 'Gols do Leões do Cerrado', 1, 'decrement')
    expect(findButton(tree, 'Registrar 3 × 1')).toBeTruthy()
    await justify(tree)
    await pressButton(tree, 'Registrar 3 × 1')
    expect(bodyOf('POST', DECIDE)).toEqual({ score: { goals_a: 3, goals_b: 1 }, justification: 'O vídeo mostra o gol antes do apito final.' })
    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('W.O.: escolhe o lado ausente, sem placar, e mostra o que vale (3 × 0)', async () => {
    const tree = await mount(divergent(), { [`POST ${DECIDE}`]: divergent({ state: 'encerrada' }) })
    await choose(tree, 'W.O., um lado não compareceu')
    expect(labelled(tree, 'Lado ausente')[0].props.accessibilityRole).toBe('radiogroup')
    expect(allText(tree)).toContain('O lado presente vence por 3 × 0. Sem restrição automática: o W.O. fica no histórico.')
    await justify(tree)
    await pressButton(tree, 'Registrar W.O.')
    expect(allText(tree)).toContain('Escolha o lado que não compareceu.')
    expect(callsTo('POST', DECIDE)).toHaveLength(0)
    await choose(tree, 'Ausente: Leões do Cerrado')
    expect(radio(tree, 'Ausente: Leões do Cerrado').props.accessibilityState).toMatchObject({ checked: true })
    await pressButton(tree, 'Registrar W.O. de Leões do Cerrado')
    expect(bodyOf('POST', DECIDE)).toEqual({ walkover_absent_side: 'b', justification: 'O vídeo mostra o gol antes do apito final.' })
    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('eliminação não aceita empate: o erro do servidor aparece e o formulário continua preenchido', async () => {
    const message422 = 'Na eliminação simples não há empate. Informe o placar final com o vencedor (some os pênaltis, se houver).'
    const tree = await mount(divergent(), { [`POST ${DECIDE}`]: new ApiError(message422, 422) })
    await choose(tree, 'Outro placar')
    await step(tree, 'Gols do Ferrugem FC', 1)
    await step(tree, 'Gols do Leões do Cerrado', 1)
    await justify(tree)
    await pressButton(tree, 'Registrar 1 × 1')
    expect(toastText()).toContain(message422)
    expect(navigation.back).not.toHaveBeenCalled()
    expect(radio(tree, 'Outro placar').props.accessibilityState).toMatchObject({ checked: true })
    expect(findButton(tree, 'Registrar 1 × 1')).toBeTruthy()
    expect(isDisabled(tree, 'Registrar 1 × 1')).toBe(false)
  })

  it('a justificativa passa de 500 caracteres: é recusada antes de enviar', async () => {
    const tree = await mount()
    await choose(tree, 'Placar informado por Leões do Cerrado: 1 × 2')
    await justify(tree, 'x'.repeat(501))
    await pressButton(tree, 'Registrar 1 × 2')
    expect(allText(tree)).toContain('Escreva a justificativa, de 5 a 500 caracteres.')
    expect(callsTo('POST', DECIDE)).toHaveLength(0)
    expect(justificationOk('x'.repeat(500))).toBe(true)
    expect(justificationOk('    ab    ')).toBe(false)
  })

  it('só um lado informou (prazo): o placar informado já vem escolhido; sem nenhum, só outro placar ou W.O.', async () => {
    const one = await mount(divergent({ phase: 'informar_resultado', result: result({ reports: { a: report('a', 2, 1), b: null }, deadline: fromNow(-1) }) }))
    expect(radio(one, 'Placar informado por Ferrugem FC: 2 × 1').props.accessibilityState).toMatchObject({ checked: true })
    expect(allText(one)).toContain('Prazo de 48 h vencido')
    expect(allText(one)).toContain('Leões do Cerrado não informou o placar')
    const none = await mount(divergent({ result: result({ reports: { a: null, b: null }, deadline: fromNow(-1) }) }))
    expect(options(none, 'Como decidir o resultado')).toHaveLength(2)
    expect(findButton(none, 'Registrar decisão')).toBeTruthy()
  })

  it('relato cego (placar oculto) não vira opção de decisão', async () => {
    const tree = await mount(divergent({ result: result({ reports: { a: null, b: hiddenReport('b') } }) }))
    expect(options(tree, 'Como decidir o resultado')).toHaveLength(2)
  })

  it('o corpo do placar informado: gols no futebol e sets (com tie-break) no tênis', () => {
    expect(reportToInput('futebol', score(2, 1))).toEqual({ goals_a: 2, goals_b: 1 })
    const sets = [
      { a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false },
      { a: 6, b: 3, tiebreak: null, super_tiebreak: false },
    ]
    expect(reportToInput('tenis', score(2, 0, { sets }))).toEqual({ sets: [{ a: 7, b: 6, tiebreak: { a: 7, b: 5 } }, { a: 6, b: 3 }] })
    expect(reportToInput('tenis', score(0, 0))).toEqual({ sets: [] })
  })
})

describe('tênis', () => {
  const sets = [{ a: 6, b: 4, tiebreak: null, super_tiebreak: false }, { a: 6, b: 3, tiebreak: null, super_tiebreak: false }]
  const tennis = (overrides: Partial<MatchDetail> = {}) => divergent({
    sport: 'tenis', format: null, super_tiebreak: false, sides: [athleteSide('a', ana), athleteSide('b', beatriz)],
    result: result({ state: 'divergente', reports: { a: report('a', 2, 0, { sets }), b: report('b', 0, 2, { sets: sets.map(set => ({ ...set, a: set.b, b: set.a })) }) } }), ...overrides,
  })

  it('o placar informado vai com os sets; "Outro placar" pede os sets e valida como o servidor', async () => {
    const tree = await mount(tennis(), { [`POST ${DECIDE}`]: tennis({ state: 'encerrada' }) })
    expect(radio(tree, 'Placar informado por Ana Souza: 6-4 6-3')).toBeTruthy()
    await choose(tree, 'Placar informado por Ana Souza: 6-4 6-3')
    await justify(tree)
    await pressButton(tree, 'Registrar 6-4 6-3')
    expect(bodyOf('POST', DECIDE)).toEqual({ score: { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] }, justification: 'O vídeo mostra o gol antes do apito final.' })
    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('outro placar: os sets dos dois lados; um placar impossível é recusado antes de enviar', async () => {
    const tree = await mount(tennis(), { [`POST ${DECIDE}`]: tennis({ state: 'encerrada' }) })
    await choose(tree, 'Outro placar')
    expect(labelled(tree, 'Placar por sets')).toHaveLength(1)
    await step(tree, 'Games de Ana Souza no set 1', 6)
    await step(tree, 'Games de Beatriz Lima no set 1', 5)
    await step(tree, 'Games de Ana Souza no set 2', 6)
    await step(tree, 'Games de Beatriz Lima no set 2', 3)
    await justify(tree)
    await pressButton(tree, 'Registrar o placar')
    expect(allText(tree)).toContain('O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.')
    expect(callsTo('POST', DECIDE)).toHaveLength(0)
    await step(tree, 'Games de Beatriz Lima no set 1', 1, 'decrement')
    await pressButton(tree, 'Registrar o placar')
    expect(bodyOf('POST', DECIDE)).toEqual({ score: { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] }, justification: 'O vídeo mostra o gol antes do apito final.' })
    expect(radio(tree, 'W.O., um lado não compareceu')).toBeTruthy()
  })

  it('o W.O. do tênis vale 6-0 6-0', async () => {
    const tree = await mount(tennis())
    await choose(tree, 'W.O., um lado não compareceu')
    expect(allText(tree)).toContain('O lado presente vence por 6-0 6-0.')
    expect(byId(tree, 'decision-form')).toHaveLength(1)
  })
})

describe('sem o que decidir', () => {
  it('já decidida: mostra o resultado e a justificativa, sem formulário', async () => {
    const decided = divergent({
      state: 'encerrada', phase: 'encerrada', permissions: { ...organizer, decide_result: false },
      result: result({ state: 'confirmado', final: score(2, 1), source: 'organizador', decision_reason: 'O vídeo mostra o gol antes do apito final.' }),
    })
    const tree = await mount(decided)
    expect(allText(tree)).toContain('Resultado decidido')
    expect(allText(tree)).toContain('Resultado registrado: 2 × 1')
    expect(allText(tree)).toContain('Justificativa: O vídeo mostra o gol antes do apito final.')
    expect(byId(tree, 'decision-form')).toHaveLength(0)
    expect(byId(tree, 'decided')).toHaveLength(1)
  })

  it('W.O. decidido mostra o lado ausente e o placar que vale', async () => {
    const decided = divergent({
      state: 'encerrada', phase: 'encerrada', permissions: { ...organizer, decide_result: false },
      walkover: { absent_side: 'b', registered_by: null, registered_at: fromNow(-2), contest_until: fromNow(40), contested_by: null, contested_at: null, contest_reason: null, decision: null, decision_reason: null },
      result: result({ state: 'confirmado', final: score(3, 0), source: 'organizador', decision_reason: 'Os Leões não compareceram.' }),
    })
    const tree = await mount(decided)
    expect(allText(tree)).toContain('W.O. de Leões do Cerrado: o lado presente venceu por 3 × 0.')
  })

  it('antes do início, cancelada ou sem resultado: um aviso no lugar do formulário', async () => {
    const before = await mount(divergent({ permissions: { ...organizer, decide_result: false }, result: null, starts_at: fromNow(24) }))
    expect(allText(before)).toContain('A partida ainda não começou: a decisão fica disponível depois do horário.')
    expect(byId(before, 'decision-form')).toHaveLength(0)
    const cancelled = await mount(divergent({ state: 'cancelada', phase: 'cancelada', permissions: { ...organizer, decide_result: false }, result: null }))
    expect(allText(cancelled)).toContain('Esta partida foi cancelada.')
    const idle = await mount(divergent({ state: 'realizada', phase: 'confirmado', permissions: { ...organizer, decide_result: false } }))
    expect(allText(idle)).toContain('Não há resultado para decidir nesta partida agora.')
  })

  it('erro de carregamento tem "Tentar novamente"; 401 chama onExpired; voltar volta', async () => {
    serve({ [MATCH]: new ApiError('Partida não encontrada.', 404) })
    const tree = await render(h(ResultDecisionScreen, { params: { matchId: 7 }, navigation, onExpired, title: 'Decidir resultado' } as never))
    trees.push(tree)
    expect(allText(tree)).toContain('Partida não encontrada.')
    serve({ [MATCH]: divergent(), [CHAT]: messagePage([]) })
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Placar divergente')
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    serve({ [MATCH]: new ApiError('Sessão expirada', 401) })
    trees.push(await render(h(ResultDecisionScreen, { params: { matchId: 7 }, navigation, onExpired, title: 'Decidir resultado' } as never)))
    expect(onExpired).toHaveBeenCalled()
  })
})
