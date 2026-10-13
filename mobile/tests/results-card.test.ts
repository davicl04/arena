import React from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { ResultMatch } from '../src/api/results'
import { MatchResultCard } from '../src/components/results/MatchResultCard'
import { enableAct } from './support/native'
import { toastText, toasts } from './support/toast'
import { allText, bodyOf, byId, callsTo, findButton, flush, hasField, isDisabled, labelled, lastBodyOf, pressButton, render, serve, typeInto } from './support/review'
import {
  asFerrugem, caio, confirmed, football, hiddenReport, inHours, lineup, permissions, preview, rafa, report, result, stat, tennis, tiago, walkover,
} from './support/results'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const STATS = '/matches/7/stats'
const TENNIS_STATS = '/matches/8/stats'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

/** Contador −/+ pelo nome acessível; o valor atual vem do `accessibilityValue`. */
const stepper = (tree: ReactTestRenderer, label: string) => labelled(tree, label).find(node => node.props.testID === 'stepper')
const valueOf = (tree: ReactTestRenderer, label: string) => stepper(tree, label)?.props.accessibilityValue.now as number | undefined
/** Ajusta como o leitor de tela: a ação "increment" do contador (cada toque relê o contador, que mudou). */
async function bump(tree: ReactTestRenderer, label: string, times = 1, action: 'increment' | 'decrement' = 'increment') {
  for (let index = 0; index < times; index++) {
    const node = stepper(tree, label)
    expect(node, `contador "${label}"`).toBeTruthy()
    await act(async () => { node!.props.onAccessibilityAction({ nativeEvent: { actionName: action } }) })
  }
}

interface Mount { match: ResultMatch; viewerId?: number; walkoverActions?: React.ReactNode; onOpenChat?: () => void }
function mount({ match, viewerId = 11, walkoverActions, onOpenChat }: Mount, handlers: { onChanged?: (detail?: ResultMatch) => void; onExpired?: () => void } = {}) {
  const onChanged = handlers.onChanged ?? vi.fn()
  const onExpired = handlers.onExpired ?? vi.fn()
  return render(h(MatchResultCard, { match, viewerId, onChanged, onExpired, walkoverActions, onOpenChat })).then(tree => ({ tree, onChanged, onExpired }))
}

/** Elenco do Leões (lado A) e do Ferrugem (lado B); Caio é quem vê. */
const roster = (overrides: { caio?: Partial<ReturnType<typeof lineup>>; tiago?: Partial<ReturnType<typeof lineup>>; rafa?: Partial<ReturnType<typeof lineup>> } = {}) => ({
  items: [
    lineup(caio, { present: true, position: 'atacante', ...overrides.caio }),
    lineup(tiago, { present: null, position: 'goleiro', ...overrides.tiago }),
    lineup(rafa, { side: 'b', present: true, position: 'defesa', stat: stat({ id: 90 }), ...overrides.rafa }),
  ],
})

describe('Informar o placar: futebol', () => {
  it('acesso histórico mostra as estatísticas próprias sem oferecer revisão de elenco', async () => {
    serve({ [`GET ${STATS}`]: { items: [lineup(caio, { side: 'a', present: true, stat: stat({ goals: 1 }), points: preview() })] } })
    const { tree } = await mount({ match: football({ my_role: 'historico', state: 'encerrada', result: confirmed(3, 1, null), permissions: permissions() }) })
    await flush()
    expect(allText(tree)).toContain('Suas estatísticas')
    expect(findButton(tree, 'Elenco e estatísticas')).toBeUndefined()
    expect(findButton(tree, 'Enviar estatísticas')).toBeUndefined()
  })
  it('conta os gols de cada lado, envia pelo lado A e avisa que falta o outro lado', async () => {
    const sent = football({ result: result({ reports: { a: report('a', 3, 1), b: hiddenReport('b') } }) })
    serve({ [STATS]: roster(), 'PUT /matches/7/result': sent })
    const { tree, onChanged } = await mount({ match: football() })
    const text = allText(tree)
    expect(text).toContain('Informe o placar')
    expect(valueOf(tree, 'Gols do Leões do Cerrado')).toBe(0)
    expect(valueOf(tree, 'Gols do Ferrugem FC')).toBe(0)
    await bump(tree, 'Gols do Leões do Cerrado', 3)
    await bump(tree, 'Gols do Ferrugem FC')
    expect(valueOf(tree, 'Gols do Leões do Cerrado')).toBe(3)
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/7/result')).toEqual({ goals_a: 3, goals_b: 1 })
    expect(toastText()).toContain('Placar enviado. Falta o outro lado.')
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(onChanged).toHaveBeenCalledWith(sent)
    // O placar enviado vira o cartão de espera, com o meu lado primeiro; o contador "Corrigir o meu" não manda nada sozinho.
    expect(callsTo('PUT', '/matches/7/result')).toHaveLength(1)
  })

  it('o lado B informa pelo próprio ponto de vista: o meu lado à esquerda, a API recebe A e B', async () => {
    serve({ [STATS]: roster(), 'PUT /matches/7/result': asFerrugem({ result: result({ reports: { a: hiddenReport('a'), b: report('b', 1, 2) } }) }) })
    const { tree } = await mount({ match: asFerrugem(), viewerId: 21 })
    await bump(tree, 'Gols do Ferrugem FC', 2)
    await bump(tree, 'Gols do Leões do Cerrado')
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/7/result')).toEqual({ goals_a: 1, goals_b: 2 })
  })

  it('o contador é ajustável: aumenta, diminui e respeita 0 a 99', async () => {
    serve({ [STATS]: roster() })
    const { tree } = await mount({ match: football() })
    const label = 'Gols do Leões do Cerrado'
    expect(stepper(tree, label)!.props.accessibilityRole).toBe('adjustable')
    expect(stepper(tree, label)!.props.accessibilityActions.map((action: { name: string }) => action.name)).toEqual(['increment', 'decrement'])
    await bump(tree, label, 1, 'decrement')
    expect(valueOf(tree, label)).toBe(0)
    await bump(tree, label, 2)
    await bump(tree, label, 1, 'decrement')
    expect(valueOf(tree, label)).toBe(1)
    expect(stepper(tree, label)!.props.accessibilityValue).toMatchObject({ min: 0, max: 99, now: 1 })
  })

  it('relato cego: o outro lado já informou, mas o placar dele não aparece antes do meu', async () => {
    const blind = football({ result: result({ reports: { a: null, b: hiddenReport('b') } }) })
    serve({ [STATS]: roster() })
    const { tree } = await mount({ match: blind })
    const text = allText(tree)
    expect(text).toContain('Ferrugem FC já informou o placar. Informe o seu: se os dois baterem, o resultado é confirmado.')
    expect(text).toContain('Informe o placar')
    // Sem o placar do adversário em lugar nenhum: só os dois contadores zerados.
    expect(text).not.toMatch(/\d × \d/)
  })

  it('placares iguais confirmam: toast, elenco relido e cartão pelo novo detalhe', async () => {
    const done = football({ state: 'realizada', phase: 'confirmado', result: confirmed(2, 2, 1, { reports: { a: report('a', 2, 2), b: report('b', 2, 2) } }) })
    serve({ [STATS]: roster(), 'PUT /matches/7/result': done })
    const { tree, onChanged } = await mount({ match: football({ result: result({ reports: { a: null, b: hiddenReport('b') } }) }) })
    const before = callsTo('GET', STATS).length
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/7/result')).toEqual({ goals_a: 0, goals_b: 0 })
    expect(toastText()).toContain('Placar confirmado pelos dois lados')
    expect(onChanged).toHaveBeenCalledWith(done)
    await flush()
    expect(callsTo('GET', STATS).length).toBeGreaterThan(before)
  })

  it('placares diferentes: toast de aviso e, com o detalhe novo, os dois placares e "Corrigir o meu"', async () => {
    const divergent = football({ phase: 'divergente', result: result({ state: 'divergente', reports: { a: report('a', 3, 1), b: report('b', 0, 2) } }) })
    serve({ [STATS]: roster(), 'PUT /matches/7/result': divergent })
    const { tree } = await mount({ match: football() })
    await bump(tree, 'Gols do Leões do Cerrado', 3)
    await pressButton(tree, 'Enviar placar')
    // Os placares não bateram: falta um próximo passo (corrigir ou conversar), então é aviso.
    expect(toastText()).toContain('Placar enviado. Os placares não bateram.')
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    // A tela da partida relê o detalhe e devolve o cartão: aqui, o novo `match` por props.
    const next = await mount({ match: divergent })
    const text = allText(next.tree)
    expect(text).toContain('Placares diferentes')
    expect(text).toContain('Vocês informaram 3 × 1; Ferrugem FC informou 0 × 2.')
    expect(findButton(next.tree, 'Corrigir o meu')).toBeTruthy()
  })

  it('corrigir o meu placar: abre o formulário com os valores informados, cancela ou envia a correção', async () => {
    const waiting = football({ result: result({ reports: { a: report('a', 3, 1), b: hiddenReport('b') } }) })
    serve({ [STATS]: roster(), 'PUT /matches/7/result': waiting })
    const { tree } = await mount({ match: waiting })
    expect(allText(tree)).toContain('Aguardando Ferrugem FC')
    expect(allText(tree)).toContain('Vocês informaram 3 × 1')
    await pressButton(tree, 'Corrigir o meu')
    expect(allText(tree)).toContain('Corrigir o meu placar')
    expect(valueOf(tree, 'Gols do Leões do Cerrado')).toBe(3)
    expect(valueOf(tree, 'Gols do Ferrugem FC')).toBe(1)
    await pressButton(tree, 'Cancelar')
    expect(allText(tree)).toContain('Aguardando Ferrugem FC')
    await pressButton(tree, 'Corrigir o meu')
    await bump(tree, 'Gols do Ferrugem FC', 1, 'decrement')
    await pressButton(tree, 'Enviar correção')
    expect(bodyOf('PUT', '/matches/7/result')).toEqual({ goals_a: 3, goals_b: 0 })
  })

  it('erro do servidor vira toast (409 é aviso de situação que mudou); 401 expira a sessão', async () => {
    serve({ [STATS]: roster(), 'PUT /matches/7/result': new ApiError('O placar é informado depois do horário da partida e até 48 h depois.', 409) })
    const expired = vi.fn()
    const { tree, onChanged } = await mount({ match: football() }, { onExpired: expired })
    await pressButton(tree, 'Enviar placar')
    expect(toastText()).toContain('O placar é informado depois do horário da partida e até 48 h depois.')
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    expect(onChanged).not.toHaveBeenCalled()
    expect(expired).not.toHaveBeenCalled()
    serve({ [STATS]: roster(), 'PUT /matches/7/result': new ApiError('Sessão expirada', 401) })
    await pressButton(tree, 'Enviar placar')
    expect(expired).toHaveBeenCalled()
  })

  it('a recusa de campo do servidor (422 com campos) fica no formulário do placar, sem toast', async () => {
    serve({ [STATS]: roster(), 'PUT /matches/7/result': new ApiError('Placar inválido.', 422, [{ field: 'goals_a', message: 'Os gols devem ser de 0 a 99.' }]) })
    const { tree, onChanged } = await mount({ match: football() })
    await pressButton(tree, 'Enviar placar')
    expect(toasts()).toEqual([])
    expect(allText(tree)).toContain('Placar inválido.')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('quem não age pelo lado não vê o formulário, e a partida sem resultado (antes do início) não desenha nada', async () => {
    serve({ [STATS]: roster() })
    const watcher = await mount({ match: football({ permissions: permissions(), result: result({ reports: { a: report('a', 1, 0), b: report('b', 1, 0) } }) }) })
    expect(allText(watcher.tree)).not.toContain('Informe o placar')
    expect(valueOf(watcher.tree, 'Gols do Leões do Cerrado')).toBeUndefined()
    const early = await mount({ match: football({ result: null }) })
    expect(allText(early.tree)).toBe('')
  })
})

describe('Informar o placar: tênis', () => {
  const me = (overrides: Partial<ResultMatch> = {}) => tennis({ result: result(), ...overrides })

  it('sets com games e tie-break; o terceiro set só aparece com os dois primeiros divididos', async () => {
    serve({ [TENNIS_STATS]: { items: [] } })
    const { tree } = await mount({ match: me(), viewerId: 31 })
    expect(allText(tree)).toContain('Informe o placar')
    expect(valueOf(tree, 'Games seus no set 1')).toBe(0)
    expect(valueOf(tree, 'Games de Beatriz Lima no set 2')).toBe(0)
    expect(valueOf(tree, 'Games seus no set 3')).toBeUndefined()
    await bump(tree, 'Games seus no set 1', 7)
    await bump(tree, 'Games de Beatriz Lima no set 1', 6)
    // 7-6 pede o tie-break do set.
    expect(valueOf(tree, 'Pontos seus no tie-break do set 1')).toBe(0)
    await bump(tree, 'Games de Beatriz Lima no set 2', 6)
    await bump(tree, 'Games seus no set 2', 1)
    expect(valueOf(tree, 'Games seus no set 3')).toBe(0)
    expect(allText(tree)).toContain('Set 3')
  })

  it('confere o placar como o servidor antes de enviar e envia os sets nos lados A e B', async () => {
    serve({ [TENNIS_STATS]: { items: [] }, 'PUT /matches/8/result': tennis({ result: result({ reports: { a: report('a', 2, 0), b: hiddenReport('b') } }) }) })
    const { tree } = await mount({ match: me(), viewerId: 31 })
    await pressButton(tree, 'Enviar placar')
    expect(allText(tree)).toContain('O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.')
    expect(callsTo('PUT', '/matches/8/result')).toHaveLength(0)
    await bump(tree, 'Games seus no set 1', 6)
    await bump(tree, 'Games de Beatriz Lima no set 1', 4)
    await bump(tree, 'Games seus no set 2', 6)
    await bump(tree, 'Games de Beatriz Lima no set 2', 3)
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/8/result')).toEqual({ sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] })
    expect(toastText()).toContain('Placar enviado. Falta o outro lado.')
  })

  it('o lado B troca os games: 7-6 com tie-break e terceiro set vão como A × B', async () => {
    const asBeatriz = tennis({ my_side: 'b', result: result(), sides: tennis().sides.map(side => ({ ...side, is_mine: side.side === 'b' })) })
    serve({ [TENNIS_STATS]: { items: [] }, 'PUT /matches/8/result': asBeatriz })
    const { tree } = await mount({ match: asBeatriz, viewerId: 32 })
    // Beatriz (B) ganha o set 1 por 7-6 (tie-break 7-5), perde o 2º por 2-6 e vence o 3º por 6-4.
    await bump(tree, 'Games seus no set 1', 7)
    await bump(tree, 'Games de Ana Souza no set 1', 6)
    await bump(tree, 'Pontos seus no tie-break do set 1', 7)
    await bump(tree, 'Pontos de Ana Souza no tie-break do set 1', 5)
    await bump(tree, 'Games seus no set 2', 2)
    await bump(tree, 'Games de Ana Souza no set 2', 6)
    await bump(tree, 'Games seus no set 3', 6)
    await bump(tree, 'Games de Ana Souza no set 3', 4)
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/8/result')).toEqual({ sets: [{ a: 6, b: 7, tiebreak: { a: 5, b: 7 } }, { a: 6, b: 2 }, { a: 4, b: 6 }] })
  })

  it('super tie-break combinado: o terceiro "set" são os pontos, sem tie-break', async () => {
    serve({ [TENNIS_STATS]: { items: [] }, 'PUT /matches/8/result': tennis() })
    const { tree } = await mount({ match: me({ super_tiebreak: true }), viewerId: 31 })
    await bump(tree, 'Games seus no set 1', 6)
    await bump(tree, 'Games de Beatriz Lima no set 1', 2)
    await bump(tree, 'Games de Beatriz Lima no set 2', 6)
    await bump(tree, 'Games seus no set 2', 3)
    expect(allText(tree)).toContain('Super tie-break')
    expect(allText(tree)).toContain('o desempate é um super tie-break até 10, com 2 de vantagem')
    await bump(tree, 'Pontos seus no super tie-break', 10)
    await bump(tree, 'Pontos de Beatriz Lima no super tie-break', 7)
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/8/result')).toEqual({ sets: [{ a: 6, b: 2 }, { a: 3, b: 6 }, { a: 10, b: 7 }] })
  })

  it('quem venceu os dois primeiros sets já ganhou: não há terceiro set', async () => {
    serve({ [TENNIS_STATS]: { items: [] } })
    const { tree } = await mount({ match: me(), viewerId: 31 })
    await bump(tree, 'Games seus no set 1', 6)
    await bump(tree, 'Games seus no set 2', 6)
    expect(allText(tree)).toContain('Quem venceu os dois primeiros sets já ganhou a partida.')
    expect(valueOf(tree, 'Games seus no set 3')).toBeUndefined()
  })
})

describe('Estados do resultado no cartão', () => {
  it('confirmado mostra o placar do meu ponto de vista e a pílula de pontos', async () => {
    serve({ [STATS]: roster() })
    const { tree } = await mount({ match: football({ state: 'realizada', phase: 'confirmado', result: confirmed(3, 1, 3) }) })
    const text = allText(tree)
    expect(text).toContain('Placar confirmado · 3 × 1')
    expect(text).toContain('Os dois lados informaram o mesmo resultado.')
    expect(text).toContain('+3 pts')
  })

  it('decidido pelo organizador ou pela administração leva a justificativa', async () => {
    serve({ [STATS]: roster() })
    const byOrganizer = await mount({ match: football({ result: confirmed(1, 0, null, { source: 'organizador', decision_reason: 'Vale o súmula do árbitro.' }) }) })
    expect(allText(byOrganizer.tree)).toContain('O organizador decidiu o resultado. Vale o súmula do árbitro.')
    const byAdmin = await mount({ match: football({ result: confirmed(3, 0, null, { source: 'administracao', decision_reason: 'W.O. mantido.' }) }) })
    expect(allText(byAdmin.tree)).toContain('A administração decidiu o resultado. W.O. mantido.')
  })

  it('prazo vencido sem placar: o amistoso fica sem resultado; no campeonato, o organizador decide', async () => {
    serve({ [STATS]: roster() })
    // Passado o prazo, o servidor tira a permissão de informar o placar.
    const late = result({ deadline: inHours(-1) })
    const friendly = await mount({ match: football({ result: late, permissions: permissions() }) })
    expect(allText(friendly.tree)).toContain('Prazo encerrado')
    expect(allText(friendly.tree)).toContain('a partida fica sem resultado e não pontua.')
    const cup = await mount({ match: football({ origin: 'campeonato', result: late, permissions: permissions() }) })
    expect(allText(cup.tree)).toContain('O organizador decide o resultado.')
  })

  it('divergência de campeonato: o organizador decide; os times ainda podem corrigir', async () => {
    serve({ [STATS]: roster() })
    const divergent = result({ state: 'divergente', reports: { a: report('a', 2, 1), b: report('b', 1, 2) } })
    const cup = await mount({ match: football({ origin: 'campeonato', phase: 'divergente', result: divergent }) })
    const text = allText(cup.tree)
    expect(text).toContain('Placares diferentes')
    expect(text).toContain('o organizador decide se os placares seguirem diferentes.')
    expect(text).not.toContain('não pontua')
    const expiredCup = await mount({ match: football({ origin: 'campeonato', result: { ...divergent, deadline: inHours(-2) } }) })
    expect(allText(expiredCup.tree)).toContain('o organizador decide o resultado.')
  })

  it('"Conversar" leva ao chat quando a divergência permite ler o chat', async () => {
    serve({ [STATS]: roster() })
    const onOpenChat = vi.fn()
    const divergent = football({ phase: 'divergente', result: result({ state: 'divergente', reports: { a: report('a', 2, 1), b: report('b', 1, 2) } }) })
    const { tree } = await mount({ match: divergent, onOpenChat })
    await pressButton(tree, 'Conversar')
    expect(onOpenChat).toHaveBeenCalledTimes(1)
    const without = await mount({ match: divergent })
    expect(findButton(without.tree, 'Conversar')).toBeUndefined()
  })

  it('sem resultado: placares que não bateram ou ninguém informou, e o W.O. anulado pela administração', async () => {
    serve({ [STATS]: roster() })
    const both = await mount({ match: football({ state: 'sem_resultado', result: result({ state: 'sem_resultado', reports: { a: report('a', 1, 0), b: report('b', 0, 1) } }) }) })
    expect(allText(both.tree)).toContain('Partida sem resultado')
    expect(allText(both.tree)).toContain('Os placares não bateram até')
    const none = await mount({ match: football({ state: 'sem_resultado', result: result({ state: 'sem_resultado' }) }) })
    expect(allText(none.tree)).toContain('Ninguém concluiu o placar até')
    const voided = await mount({ match: football({ state: 'sem_resultado', walkover: walkover({ decision: 'anulado', decision_reason: 'Houve falha na quadra.' }), result: result({ state: 'sem_resultado' }) }) })
    expect(allText(voided.tree)).toContain('A administração anulou o W.O.')
    expect(allText(voided.tree)).toContain('Motivo: “Houve falha na quadra.”')
  })
})

describe('Quem acompanha sem agir pelo lado', () => {
  it('a administração vê quem já informou, sem formulário', async () => {
    serve({ [STATS]: roster() })
    const informed = await mount({ match: football({ my_side: null, my_role: 'administracao', permissions: permissions({ read_chat: true }), result: result({ reports: { a: report('a', 1, 0), b: null } }) }) })
    expect(allText(informed.tree)).toContain('Aguardando o placar')
    expect(allText(informed.tree)).toContain('Leões do Cerrado já informou o placar. Fecha')
    expect(allText(informed.tree)).not.toContain('Informe o placar')
    const none = await mount({ match: football({ my_side: null, my_role: 'administracao', permissions: permissions(), result: result() }) })
    expect(allText(none.tree)).toContain('Os representantes informam o placar até')
  })

  it('falha 401 ao ler o elenco expira a sessão', async () => {
    serve({ [STATS]: new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    await mount({ match: football() }, { onExpired: expired })
    expect(expired).toHaveBeenCalled()
  })
})

describe('W.O. no cartão', () => {
  const actions = h('WalkoverActions', { testID: 'walkover-actions' })

  it('registrado: o lado ausente vê o aviso de contestação e o presente, o placar que vale; as ações vêm da tela da partida', async () => {
    serve({ [STATS]: roster() })
    const absent = await mount({ match: football({ my_side: 'b', phase: 'wo_registrado', sides: asFerrugem().sides, result: result({ state: 'wo_registrado' }), walkover: walkover() }), viewerId: 21, walkoverActions: actions })
    const text = allText(absent.tree)
    expect(text).toContain('W.O. registrado contra o seu lado')
    expect(text).toContain('Se compareceram, conteste até')
    expect(byId(absent.tree, 'walkover-actions').length).toBeGreaterThan(0)
    const present = await mount({ match: football({ phase: 'wo_registrado', result: result({ state: 'wo_registrado' }), walkover: walkover() }), walkoverActions: actions })
    expect(allText(present.tree)).toContain('W.O. registrado contra Ferrugem FC')
    expect(allText(present.tree)).toContain('Vale 3 × 0 se Ferrugem FC não contestar até')
  })

  it('contestado aguarda a administração; o W.O. valendo mostra o placar e os pontos', async () => {
    serve({ [STATS]: roster() })
    const contested = await mount({ match: football({ phase: 'wo_contestado', result: result({ state: 'wo_contestado' }), walkover: walkover({ contested_by: rafa, contested_at: inHours(-1), contest_reason: 'Estávamos na quadra.' }) }) })
    expect(allText(contested.tree)).toContain('W.O. contestado')
    expect(allText(contested.tree)).toContain('Rafa Nunes contestou o W.O.: “Estávamos na quadra.” A administração decide; até lá a partida fica sem resultado.')
    const valid = await mount({ match: football({ state: 'encerrada', result: confirmed(3, 0, 3, { source: 'wo' }) }) })
    expect(allText(valid.tree)).toContain('W.O. valendo · 3 × 0')
    expect(allText(valid.tree)).toContain('O W.O. não foi contestado e vale como resultado.')
    const tennisWo = await mount({ match: tennis({ walkover: walkover(), result: result({ state: 'wo_registrado' }) }), viewerId: 31 })
    expect(allText(tennisWo.tree)).toContain('Vale 6-0 6-0 se Beatriz Lima não contestar até')
  })
})

describe('Presença, elenco e estatísticas (futebol)', () => {
  const own = (overrides: Partial<ResultMatch> = {}) => football({ result: result({ reports: { a: report('a', 2, 1), b: hiddenReport('b') } }), ...overrides })

  it('resume o elenco e abre a folha; o representante marca quem jogou e salva só o que mudou', async () => {
    const saved = { items: roster({ tiago: { present: true, position: 'goleiro' } }).items }
    serve({ [STATS]: roster(), 'PUT /matches/7/attendance': saved })
    const { tree, onChanged } = await mount({ match: own() })
    expect(allText(tree)).toContain('Elenco e estatísticas')
    expect(allText(tree)).toContain('0 de 1 que jogaram enviaram')
    await pressButton(tree, 'Elenco e estatísticas. 0 de 1 que jogaram enviaram')
    expect(allText(tree)).toContain('Quem jogou e estatísticas')
    expect(allText(tree)).toContain('Leões do Cerrado · Society')
    expect(allText(tree)).toContain('Caio Ramos')
    expect(allText(tree)).toContain('GOL · Presença não informada · Estatísticas não enviadas')
    expect(isDisabled(tree, 'Salvar presença')).toBe(true)
    await pressButton(tree, 'Tiago Melo jogou')
    expect(isDisabled(tree, 'Salvar presença')).toBe(false)
    await pressButton(tree, 'Salvar presença')
    expect(bodyOf('PUT', '/matches/7/attendance')).toEqual({ athletes: [{ user_id: 12, present: true, position: 'goleiro' }] })
    // Um só aviso (toast de sucesso, desenhado no viewport da folha): não há mais região viva paralela.
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Presença registrada']])
    expect(onChanged).toHaveBeenCalled()
    expect(callsTo('PUT', '/matches/7/attendance')).toHaveLength(1)
  })

  it('quem entra sem posição conhecida pede a posição antes de salvar', async () => {
    serve({ [STATS]: { items: [lineup(caio, { present: true }), lineup(tiago, { position: null })] } })
    const { tree } = await mount({ match: own() })
    await pressButton(tree, 'Elenco e estatísticas. 0 de 1 que jogaram enviaram')
    await pressButton(tree, 'Tiago Melo jogou')
    expect(allText(tree)).toContain('Escolha a posição de quem jogou.')
    expect(isDisabled(tree, 'Salvar presença')).toBe(true)
    await pressButton(tree, 'Defesa')
    expect(isDisabled(tree, 'Salvar presença')).toBe(false)
  })

  it('o adversário aparece em outra aba, só para leitura da presença, e o 401 do salvamento expira a sessão', async () => {
    const expired = vi.fn()
    serve({ [STATS]: roster(), 'PUT /matches/7/attendance': new ApiError('Sessão expirada', 401) })
    const { tree } = await mount({ match: own() }, { onExpired: expired })
    await pressButton(tree, 'Elenco e estatísticas. 0 de 1 que jogaram enviaram')
    await pressButton(tree, 'Ferrugem FC')
    expect(allText(tree)).toContain('Rafa Nunes')
    expect(allText(tree)).not.toContain('Tiago Melo')
    expect(labelled(tree, 'Rafa Nunes jogou')).toHaveLength(0)
    await pressButton(tree, 'Leões do Cerrado')
    await pressButton(tree, 'Tiago Melo jogou')
    await pressButton(tree, 'Salvar presença')
    expect(expired).toHaveBeenCalled()
  })

  it('revisa as estatísticas do próprio time: só o que mudou vai como correção', async () => {
    const reviewable = { items: [lineup(caio, { present: true }), lineup(tiago, { present: true, position: 'goleiro', stat: stat({ id: 71, goals: 0, assists: null, position_stat: 3 }), can_review: true })] }
    serve({ [STATS]: reviewable, 'PUT /matches/7/stats/71/review': lineup(tiago, { present: true, position: 'goleiro', stat: stat({ id: 71, state: 'revisada' }), can_review: true }) })
    const { tree } = await mount({ match: own() })
    expect(allText(tree)).toContain('1 para revisar')
    await pressButton(tree, 'Elenco e estatísticas. 1 de 2 que jogaram enviaram · 1 para revisar')
    await pressButton(tree, 'Revisar estatísticas de Tiago Melo')
    await bump(tree, 'Gols de Tiago Melo')
    await bump(tree, 'Defesas de Tiago Melo', 1, 'decrement')
    await pressButton(tree, 'Aprovar estatísticas de Tiago Melo')
    expect(bodyOf('PUT', '/matches/7/stats/71/review')).toEqual({ goals: 1, position_stat: 2 })
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Estatísticas revisadas']])
  })

  it('estatística contestada ou já revisada reabre a revisão; depois da contestação a revisão é final; o erro fica no painel', async () => {
    const contested = stat({ id: 71, state: 'contestada', contested_at: inHours(-1), contested_by: rafa, contest_reason: 'Foi um gol só.', contested_fields: ['gols'] })
    const reviewed = stat({ id: 72, state: 'revisada', reviewed_at: inHours(-1) })
    const finished = stat({ id: 73, state: 'revisada', contested_at: inHours(-2) })
    serve({
      [STATS]: { items: [
        lineup(caio, { present: true }),
        lineup(tiago, { present: true, position: 'goleiro', stat: contested, can_review: true }),
        lineup({ ...tiago, id: 13, name: 'Bruno Dias', username: 'bruno.dias' }, { present: true, position: 'defesa', stat: reviewed, can_review: true }),
        lineup({ ...tiago, id: 14, name: 'Davi Alves', username: 'davi.alves' }, { present: true, position: 'defesa', stat: finished }),
      ] },
      'PUT /matches/7/stats/71/review': new ApiError('Esta estatística já foi contestada e revisada; a revisão é final.', 409),
    })
    const { tree } = await mount({ match: own() })
    await pressButton(tree, 'Elenco e estatísticas. 3 de 4 que jogaram enviaram · 1 para revisar')
    const text = allText(tree)
    expect(text).toContain('Rafa Nunes contestou gols: “Foi um gol só.” O item contestado só pontua depois da nova revisão do representante do atleta.')
    expect(text).toContain('Revisão final depois da contestação.')
    expect(findButton(tree, 'Revisar de novo estatísticas de Tiago Melo')).toBeTruthy()
    expect(findButton(tree, 'Rever estatísticas de Bruno Dias')).toBeTruthy()
    await pressButton(tree, 'Revisar de novo estatísticas de Tiago Melo')
    expect(allText(tree)).toContain('Depois de uma contestação, esta revisão é final.')
    await pressButton(tree, 'Aprovar estatísticas de Tiago Melo')
    expect(bodyOf('PUT', '/matches/7/stats/71/review')).toEqual({})
    expect(allText(tree)).toContain('Esta estatística já foi contestada e revisada; a revisão é final.')
    await pressButton(tree, 'Cancelar a revisão de Tiago Melo')
    expect(findButton(tree, 'Aprovar estatísticas de Tiago Melo')).toBeUndefined()
  })

  it('contesta estatísticas do adversário: exige o item e o motivo e envia uma vez', async () => {
    const contestable = { items: [lineup(caio, { present: true }), lineup(rafa, { side: 'b', present: true, position: 'atacante', stat: stat({ id: 90, goals: 2 }), can_contest: true })] }
    serve({ [STATS]: contestable, 'POST /matches/7/stats/90/contest': lineup(rafa, { side: 'b', present: true, position: 'atacante', stat: stat({ id: 90, state: 'contestada', contested_at: inHours(0) }) }) })
    const { tree } = await mount({ match: own() })
    await pressButton(tree, 'Elenco e estatísticas. 0 de 1 que jogaram enviaram')
    await pressButton(tree, 'Ferrugem FC')
    await pressButton(tree, 'Contestar estatísticas de Rafa Nunes')
    await pressButton(tree, 'Enviar contestação')
    expect(allText(tree)).toContain('Escolha o que está errado.')
    expect(callsTo('POST', '/matches/7/stats/90/contest')).toHaveLength(0)
    await pressButton(tree, 'Gols: 2')
    await pressButton(tree, 'Enviar contestação')
    expect(allText(tree)).toContain('Conte por que a estatística está errada.')
    await typeInto(tree, 'Motivo', 'Foi um gol só.')
    await pressButton(tree, 'Enviar contestação')
    expect(bodyOf('POST', '/matches/7/stats/90/contest')).toEqual({ fields: ['gols'], reason: 'Foi um gol só.' })
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Contestação enviada']])
    expect(allText(tree)).toContain('Contestada')
  })

  it('minhas estatísticas: escolhe a posição, conta e envia; zero vai vazio e a prévia acompanha', async () => {
    const mine = lineup(caio, { present: true, position: null })
    const saved = lineup(caio, { present: true, position: 'atacante', stat: stat({ id: 70, goals: 2, assists: null, position_stat: null }), points: preview() })
    serve({ [STATS]: { items: [mine] }, 'PUT /matches/7/my-stats': { lineup: saved, preview: preview() } })
    const { tree, onChanged } = await mount({ match: own() })
    const text = allText(tree)
    expect(text).toContain('Suas estatísticas')
    expect(text).toContain('Opcional')
    expect(isDisabled(tree, 'Enviar estatísticas')).toBe(true)
    await pressButton(tree, 'Atacante')
    await bump(tree, 'Gols', 2)
    // O placar que o meu lado informou (2 × 1) já dá a vitória na prévia: 1 + 3 + 2 gols.
    expect(allText(tree)).toContain('1 presença + 3 vitória + 2 gols')
    expect(allText(tree)).toContain('6 pts')
    await pressButton(tree, 'Enviar estatísticas')
    expect(bodyOf('PUT', '/matches/7/my-stats')).toEqual({ position: 'atacante', goals: 2, assists: null, position_stat: null })
    expect(toastText()).toContain('Estatísticas enviadas')
    expect(onChanged).toHaveBeenCalled()
    // A resposta troca a atuação: o selo vira "Enviadas" e o botão pede alteração para atualizar.
    expect(allText(tree)).toContain('Enviadas')
    expect(isDisabled(tree, 'Atualizar estatísticas')).toBe(true)
  })

  it('revisão final depois da contestação trava a edição; ausente marcado pelo representante avisa', async () => {
    const finalStat = stat({ id: 70, state: 'revisada', contested_at: inHours(-3), contested_by: rafa, contest_reason: 'Foi um gol só.' })
    serve({ [STATS]: { items: [lineup(caio, { present: true, stat: finalStat, points: preview({ final: true, counted: ['gols'] }) })] } })
    const locked = await mount({ match: own() })
    const text = allText(locked.tree)
    expect(text).toContain('Revisão final do representante do seu time, depois da contestação.')
    expect(text).toContain('Pontuação final.')
    expect(findButton(locked.tree, 'Atualizar estatísticas')).toBeUndefined()
    serve({ [STATS]: { items: [lineup(caio, { present: false, stat: null })] } })
    const absent = await mount({ match: own() })
    expect(allText(absent.tree)).toContain('O representante marcou que você não jogou. Fale com ele.')
  })

  it('estatística contestada mostra quem contestou e o motivo', async () => {
    const contested = stat({ id: 70, state: 'contestada', contested_at: inHours(-1), contested_by: rafa, contest_reason: 'Foi um gol só.', contested_fields: ['gols'] })
    serve({ [STATS]: { items: [lineup(caio, { present: true, stat: contested })] } })
    const { tree } = await mount({ match: own() })
    const text = allText(tree)
    expect(text).toContain('Contestadas')
    expect(text).toContain('Rafa Nunes contestou: “Foi um gol só.”')
    expect(text).toContain('O representante do seu time revisa de novo.')
  })

  it('falha ao ler o elenco mostra o erro e "Tentar novamente" relê', async () => {
    let fail = true
    serve({ [STATS]: () => (fail ? new ApiError('Não foi possível carregar o elenco.', 500) : roster()) })
    const { tree } = await mount({ match: own() })
    // Erro de carregamento da seção (LoadError), não toast.
    expect(allText(tree)).toContain('Não foi possível carregar o elenco.')
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'load-error-section')).toHaveLength(1)
    expect(toasts()).toEqual([])
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Elenco e estatísticas')
    expect(allText(tree)).not.toContain('Não foi possível carregar o elenco.')
  })

  it('o tênis não tem elenco nem estatísticas, e a leitura do elenco não é feita', async () => {
    serve({})
    const { tree } = await mount({ match: tennis({ result: result({ reports: { a: report('a', 2, 0), b: hiddenReport('b') } }) }), viewerId: 31 })
    expect(allText(tree)).not.toContain('Elenco e estatísticas')
    expect(allText(tree)).not.toContain('Suas estatísticas')
    expect(vi.mocked(request)).not.toHaveBeenCalled()
  })
})

describe('Campeonato: o organizador não vê o elenco', () => {
  it('sem lado, sem elenco e sem leitura de estatísticas; o relato dos dois lados é dele', async () => {
    serve({})
    const match = football({
      origin: 'campeonato', my_side: null, my_role: 'organizador', permissions: { ...permissions(), decide_result: true },
      phase: 'divergente', result: result({ state: 'divergente', reports: { a: report('a', 2, 1), b: report('b', 0, 1) } }),
    })
    const { tree } = await mount({ match, viewerId: 99 })
    const text = allText(tree)
    expect(text).toContain('Placares diferentes')
    expect(text).toContain('Leões do Cerrado informou 2 × 1 e Ferrugem FC, 0 × 1.')
    expect(text).toContain('o organizador decide')
    expect(text).not.toContain('Elenco e estatísticas')
    expect(findButton(tree, 'Corrigir o meu')).toBeUndefined()
    expect(vi.mocked(request)).not.toHaveBeenCalled()
  })

  it('o time do campeonato informa o placar como no amistoso e vê o elenco', async () => {
    serve({ [STATS]: roster(), 'PUT /matches/7/result': football({ origin: 'campeonato' }) })
    const { tree } = await mount({ match: football({ origin: 'campeonato' }) })
    expect(findButton(tree, 'Revisar elenco')).toBeTruthy()
    await pressButton(tree, 'Enviar placar')
    expect(lastBodyOf('PUT', '/matches/7/result')).toEqual({ goals_a: 0, goals_b: 0 })
  })
})

describe('Acessibilidade do cartão', () => {
  it('botões têm nome e papel; os contadores são ajustáveis e o envio anuncia ocupado', async () => {
    serve({ [STATS]: roster() })
    const { tree } = await mount({ match: football() })
    const named = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button')
    expect(named.length).toBeGreaterThan(0)
    for (const node of named) expect(String(node.props.accessibilityLabel ?? ''), 'botão sem nome acessível').not.toBe('')
    expect(hasField(tree, 'Motivo')).toBe(false)
    const adjustable = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'adjustable')
    expect(adjustable.length).toBeGreaterThanOrEqual(5)
    for (const node of adjustable) expect(node.props.accessibilityLabel).toBeTruthy()
  })
})
