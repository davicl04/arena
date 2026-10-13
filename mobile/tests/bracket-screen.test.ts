import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Bracket } from '../src/api/brackets'
import BracketScreen from '../src/screens/BracketScreen'
import { enableAct } from './support/native'
import { competitor, confirmed, eightTeams, eliminationBracket, roundRobinBracket, score, sixTeams, undrawn } from './support/brackets'
import { allText, bodyOf, byId, callsTo, findButton, findByPrefix, flush, isDisabled, labelled, navigationMock, pressButton, pressPrefix, render, serve } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Chaveamento do campeonato (B3 + T2), do lado do organizador: sorteio, "Sortear de novo", troca de lugares por toque,
 * confirmação (com e sem `draw_blocker`), todos contra todos e o campeão com as colocações. A tela obedece a `permissions`.
 */

const h = React.createElement
const BRACKET = '/events/5/bracket'
const ORG = '/organizer/events/5/bracket'
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

async function mount() {
  const tree = await render(h(BracketScreen, { params: { eventId: 5 }, navigation, onExpired, title: 'Chaveamento' } as never))
  trees.push(tree)
  return tree
}
const drawn = (places: (string | null)[] = eightTeams, overrides: Partial<Bracket> = {}) => eliminationBracket(places, overrides)
/** Frases dos confrontos na lista por rodada (a alternativa acessível ao desenho). */
const matchupLabels = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.testID === 'string' && node.props.testID.startsWith('node-'))
  .map(node => node.props.accessibilityLabel as string)

describe('sem sorteio', () => {
  it('explica o sorteio e sorteia: a árvore aparece com o aviso de que só o organizador a vê', async () => {
    serve({ [BRACKET]: undrawn(), [`POST ${ORG}`]: drawn() })
    const tree = await mount()
    // A placa traz a própria barra: o título e o Voltar.
    expect(allText(tree)).toContain('Chaveamento')
    expect(allText(tree)).toContain('Sorteie o chaveamento')
    expect(allText(tree)).toContain('Quem ficar sem adversário na primeira fase tem folga e passa direto.')
    expect(findButton(tree, 'Confirmar chaveamento')).toBeUndefined()
    await pressButton(tree, 'Sortear chaveamento')
    expect(callsTo('POST', ORG)).toHaveLength(1)
    expect(bodyOf('POST', ORG)).toEqual({})
    expect(allText(tree)).toContain('Sorteio feito. Confira e confirme quando estiver pronto.')
    expect(allText(tree)).toContain('Os times só veem a chave depois que você confirmar.')
    expect(allText(tree)).toContain('Eliminação simples · chave de 8')
    // A árvore é uma imagem; os confrontos estão na lista por rodada, que o leitor de tela lê.
    expect(labelled(tree, 'Árvore do chaveamento: 8 lugares. Os confrontos estão na lista por rodada logo abaixo.').length).toBeGreaterThan(0)
    expect(matchupLabels(tree)).toHaveLength(7)
    expect(matchupLabels(tree)[0]).toBe('Quartas de final: J1: Novo Horizonte contra Bola Murcha FC.')
    expect(findButton(tree, 'Confirmar chaveamento')).toBeTruthy()
    expect(findButton(tree, 'Sortear de novo')).toBeTruthy()
  })

  it('draw_blocker: mostra o motivo e não deixa sortear', async () => {
    const reason = 'As inscrições ainda estão abertas. Sorteie depois do fim das inscrições.'
    serve({ [BRACKET]: undrawn(reason), [`POST ${ORG}`]: drawn() })
    const tree = await mount()
    expect(byId(tree, 'draw-blocker')).toHaveLength(1)
    expect(allText(tree)).toContain(reason)
    expect(isDisabled(tree, 'Sortear chaveamento')).toBe(true)
    expect(findButton(tree, 'Sortear chaveamento')!.props.accessibilityState).toMatchObject({ disabled: true })
    expect(callsTo('POST', ORG)).toHaveLength(0)
  })

  it('o servidor recusa o sorteio: o erro fica na tela, sem árvore', async () => {
    serve({ [BRACKET]: undrawn(), [`POST ${ORG}`]: new ApiError('Confirme pelo menos 2 inscrições para sortear o campeonato.', 409) })
    const tree = await mount()
    await pressButton(tree, 'Sortear chaveamento')
    expect(allText(tree)).toContain('Confirme pelo menos 2 inscrições para sortear o campeonato.')
    expect(matchupLabels(tree)).toHaveLength(0)
    expect(findButton(tree, 'Confirmar chaveamento')).toBeUndefined()
  })

  it('no tênis o texto fala em atletas, não em times', async () => {
    const tennis = undrawn(null, { sport: 'tenis', format: null })
    serve({ [BRACKET]: tennis, [`POST ${ORG}`]: drawn(eightTeams, { sport: 'tenis', format: null }) })
    const tree = await mount()
    expect(allText(tree)).toContain('O sorteio monta a chave com os atletas confirmados.')
    expect(allText(tree)).not.toContain('times')
    await pressButton(tree, 'Sortear chaveamento')
    expect(allText(tree)).toContain('Os atletas só veem a chave depois que você confirmar.')
    expect(allText(tree)).toContain('Toque em dois atletas para trocá-los de lugar.')
  })
})

describe('todos contra todos', () => {
  const five = () => roundRobinBracket()

  it('sorteia as rodadas, sem troca manual, com a tabela cruzada, a folga por rodada e a classificação 3/1/0', async () => {
    serve({ [BRACKET]: undrawn(null, { kind: 'todos_contra_todos' }), [`POST ${ORG}`]: five() })
    const tree = await mount()
    expect(allText(tree)).toContain('Sorteie as rodadas')
    expect(allText(tree)).toContain('um folga em cada rodada')
    await pressButton(tree, 'Sortear rodadas')
    expect(allText(tree)).toContain('Tabela')
    expect(allText(tree)).toContain('No todos contra todos não há encaixe manual')
    expect(allText(tree)).toContain('Todos contra todos · 5 times')
    // Tabela cruzada: a rodada de cada confronto; quem folga em cada rodada; classificação.
    expect(byId(tree, 'cross-table')).toHaveLength(1)
    const [a, b] = five().rounds[0].nodes[0].slots.map(slot => slot.competitor!.team!.name)
    expect(labelled(tree, `${a} contra ${b}: rodada 1`)).toHaveLength(1)
    expect(labelled(tree, `${b} contra ${a}: rodada 1`)).toHaveLength(1)
    expect(allText(tree)).toContain('Folga por rodada: rodada 1, ')
    expect(byId(tree, 'rest-list')).toHaveLength(1)
    expect(byId(tree, 'standings')).toHaveLength(1)
    expect(labelled(tree, '1º, Novo Horizonte: 0 pontos, 0 jogos, 0 vitórias, 0 empates, 0 derrotas, 0 gols pró, 0 gols contra, 0 saldo de gols')).toHaveLength(1)
    // Sem troca manual: nenhum botão de lugar, e a confirmação fala em tabela.
    expect(findByPrefix(tree, 'Novo Horizonte, lugar')).toBeUndefined()
    expect(allText(tree)).not.toContain('Toque em dois times')
    expect(findButton(tree, 'Confirmar tabela')).toBeTruthy()
    expect(findButton(tree, 'Confirmar chaveamento')).toBeUndefined()
  })

  it('confirma a tabela e a classificação anda com os resultados (vitória 3, empate 1, derrota 0)', async () => {
    const played = roundRobinBracket(undefined, {
      table: [
        { position: 1, competitor: competitor(2, 'Leões do Cerrado', 1), played: 2, wins: 2, draws: 0, losses: 0, goals_for: 5, goals_against: 1, goal_difference: 4, points: 6 },
        { position: 2, competitor: competitor(1, 'Novo Horizonte', 0), played: 2, wins: 0, draws: 1, losses: 1, goals_for: 2, goals_against: 3, goal_difference: -1, points: 1 },
      ],
    })
    serve({ [BRACKET]: confirmed(played), })
    const tree = await mount()
    expect(labelled(tree, '1º, Leões do Cerrado: 6 pontos, 2 jogos, 2 vitórias, 0 empates, 0 derrotas, 5 gols pró, 1 gols contra, 4 saldo de gols')).toHaveLength(1)
    expect(labelled(tree, '2º, Novo Horizonte: 1 ponto, 2 jogos, 0 vitórias, 1 empates, 1 derrotas, 2 gols pró, 3 gols contra, -1 saldo de gols')).toHaveLength(1)
    expect(allText(tree)).toContain('Tabela confirmado')
    expect(findButton(tree, 'Ver e agendar partidas')).toBeTruthy()
  })

  it('tênis: a classificação usa sets e os atletas aparecem com o nome', async () => {
    const tennis = confirmed(roundRobinBracket(['Ana Souza', 'Beatriz Lima', 'Carla Dias'], { sport: 'tenis', format: null }))
    serve({ [BRACKET]: tennis })
    const tree = await mount()
    expect(allText(tree)).toContain('Todos contra todos · 3 atletas')
    expect(labelled(tree, '1º, Ana Souza: 0 pontos, 0 jogos, 0 vitórias, 0 empates, 0 derrotas, 0 sets pró, 0 sets contra, 0 saldo de sets').length).toBe(1)
    expect(allText(tree)).toContain('Atleta')
  })
})

describe('trocar lugares', () => {
  const first = () => drawn()
  /** O mesmo sorteio com os dois primeiros lugares trocados. */
  const swapped = () => drawn(['Bola Murcha FC', 'Novo Horizonte', ...eightTeams.slice(2)])

  it('escolhe um time, o segundo toque envia {a, b} e a árvore já vem trocada', async () => {
    serve({ [BRACKET]: first(), [`PATCH ${ORG}`]: swapped() })
    const tree = await mount()
    expect(allText(tree)).toContain('Toque em dois times para trocá-los de lugar.')
    await pressPrefix(tree, 'Novo Horizonte, lugar 1 da chave')
    expect(allText(tree)).toContain('Novo Horizonte escolhido. Toque em quem vai trocar de lugar com ele.')
    expect(allText(tree)).toContain('Agora toque no time que vai para o lugar de Novo Horizonte.')
    expect(findByPrefix(tree, 'Novo Horizonte, lugar 1 da chave, escolhido')!.props.accessibilityState.selected).toBe(true)
    expect(callsTo('PATCH', ORG)).toHaveLength(0)
    await pressPrefix(tree, 'Bola Murcha FC, lugar 2 da chave')
    expect(bodyOf('PATCH', ORG)).toEqual({ a: 0, b: 1 })
    expect(allText(tree)).toContain('Novo Horizonte e Bola Murcha FC trocaram de lugar.')
    // A lista por rodada já mostra o confronto na nova ordem, e a escolha foi solta.
    expect(matchupLabels(tree)[0]).toContain('J1: Bola Murcha FC contra Novo Horizonte')
    expect(findByPrefix(tree, 'Novo Horizonte, lugar 2 da chave')!.props.accessibilityState.selected).toBe(false)
    expect(allText(tree)).toContain('Toque em dois times para trocá-los de lugar.')
  })

  it('tocar duas vezes no mesmo time cancela a escolha, e uma folga também pode ser escolhida', async () => {
    serve({ [BRACKET]: drawn(sixTeams), [`PATCH ${ORG}`]: drawn(sixTeams) })
    const tree = await mount()
    expect(byId(tree, 'draw-blocker')).toHaveLength(0)
    await pressPrefix(tree, 'Atlético Guará, lugar 3 da chave')
    await pressPrefix(tree, 'Atlético Guará, lugar 3 da chave, escolhido')
    expect(allText(tree)).toContain('Troca cancelada.')
    expect(callsTo('PATCH', ORG)).toHaveLength(0)
    // Um time pode ocupar o lugar de uma folga (a folga está no lugar 2).
    await pressPrefix(tree, 'Novo Horizonte, lugar 1 da chave')
    await pressPrefix(tree, 'Folga, lugar 2 da chave')
    expect(bodyOf('PATCH', ORG)).toEqual({ a: 0, b: 1 })
  })

  it('a troca recusada pelo servidor mostra o erro e solta a escolha', async () => {
    serve({ [BRACKET]: first(), [`PATCH ${ORG}`]: new ApiError('Essa troca deixaria um jogo sem nenhum time. Escolha outros lugares.', 422) })
    const tree = await mount()
    await pressPrefix(tree, 'Novo Horizonte, lugar 1 da chave')
    await pressPrefix(tree, 'Atlético Guará, lugar 3 da chave')
    expect(allText(tree)).toContain('Essa troca deixaria um jogo sem nenhum time. Escolha outros lugares.')
    expect(findByPrefix(tree, 'Novo Horizonte, lugar 1 da chave')!.props.accessibilityState.selected).toBe(false)
    expect(findByPrefix(tree, 'Atlético Guará, lugar 3 da chave')).toBeTruthy()
  })

  it('"Sortear de novo" refaz o sorteio e descarta as trocas', async () => {
    serve({ [BRACKET]: first(), [`POST ${ORG}`]: drawn(eightTeams, { draw_count: 2 }) })
    const tree = await mount()
    await pressPrefix(tree, 'Novo Horizonte, lugar 1 da chave')
    await pressButton(tree, 'Sortear de novo')
    expect(callsTo('POST', ORG)).toHaveLength(1)
    expect(allText(tree)).toContain('Sorteio refeito. As trocas anteriores foram descartadas.')
    expect(allText(tree)).toContain('Sorteio nº 2')
    expect(findByPrefix(tree, 'Novo Horizonte, lugar 1 da chave, escolhido')).toBeUndefined()
  })

  it('sem permissão de troca ou de sorteio, os botões ficam desabilitados e a árvore é só leitura', async () => {
    const locked = drawn(eightTeams, { permissions: { can_draw: false, can_swap: false, can_confirm: false, draw_blocker: null } })
    serve({ [BRACKET]: locked })
    const tree = await mount()
    expect(findByPrefix(tree, 'Novo Horizonte, lugar')).toBeUndefined()
    expect(isDisabled(tree, 'Sortear de novo')).toBe(true)
    expect(isDisabled(tree, 'Confirmar chaveamento')).toBe(true)
    expect(allText(tree)).not.toContain('Toque em dois times')
  })
})

const done = () => confirmed(drawn(eightTeams, {}), { size: 8 })

describe('confirmar', () => {

  it('abre a folha de confirmação, confirma e leva às partidas', async () => {
    serve({ [BRACKET]: drawn(), [`POST ${ORG}/confirm`]: done() })
    const tree = await mount()
    await pressButton(tree, 'Confirmar chaveamento')
    expect(allText(tree)).toContain('não dá mais para trocar os lugares nem sortear de novo')
    expect(allText(tree)).toContain('Com algum comprovante em análise, a confirmação é recusada')
    expect(callsTo('POST', `${ORG}/confirm`)).toHaveLength(0)
    await pressButton(tree, 'Confirmar')
    expect(bodyOf('POST', `${ORG}/confirm`)).toEqual({})
    expect(allText(tree)).toContain('Chaveamento confirmado. As partidas foram criadas e os times foram avisados.')
    expect(allText(tree)).not.toContain('não dá mais para trocar')
    // Confirmado: sem sortear de novo, com o atalho das partidas e os vencedores avançando sozinhos.
    expect(findButton(tree, 'Sortear de novo')).toBeUndefined()
    expect(findByPrefix(tree, 'Novo Horizonte, lugar')).toBeUndefined()
    expect(allText(tree)).toContain('Os vencedores avançam sozinhos quando o resultado de cada jogo é definido.')
    await pressButton(tree, 'Ver e agendar partidas')
    expect(navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5 })
  })

  it('comprovante em análise: o servidor recusa e a folha continua aberta com o motivo', async () => {
    serve({ [BRACKET]: drawn(), [`POST ${ORG}/confirm`]: new ApiError('Analise 1 comprovante pendente antes de confirmar o chaveamento.', 409) })
    const tree = await mount()
    await pressButton(tree, 'Confirmar chaveamento')
    await pressButton(tree, 'Confirmar')
    expect(allText(tree)).toContain('Analise 1 comprovante pendente antes de confirmar o chaveamento.')
    expect(allText(tree)).toContain('não dá mais para trocar os lugares')
    expect(findButton(tree, 'Confirmar')).toBeTruthy()
  })

  it('409 porque outra aba já confirmou: relê o chaveamento, fecha a folha e deixa o aviso do servidor, sem botões sobre o estado velho', async () => {
    let reads = 0
    const message = 'O chaveamento já foi confirmado.'
    serve({
      [BRACKET]: () => (++reads === 1 ? drawn() : done()),
      [`POST ${ORG}/confirm`]: new ApiError(message, 409),
    })
    const tree = await mount()
    await pressButton(tree, 'Confirmar chaveamento')
    await pressButton(tree, 'Confirmar')
    expect(callsTo('GET', BRACKET)).toHaveLength(2)
    // A folha fecha (a confirmação não cabe mais), o aviso fica na tela e os botões seguem o estado de agora.
    expect(allText(tree)).toContain(message)
    expect(allText(tree)).not.toContain('não dá mais para trocar')
    expect(findButton(tree, 'Confirmar chaveamento')).toBeUndefined()
    expect(findButton(tree, 'Sortear de novo')).toBeUndefined()
    expect(findButton(tree, 'Ver e agendar partidas')).toBeTruthy()
  })

  it('409 ao trocar (já confirmado em outra aba): relê e deixa de oferecer a troca e o sorteio', async () => {
    let reads = 0
    const message = 'O chaveamento já foi confirmado: não dá mais para trocar os lugares.'
    serve({
      [BRACKET]: () => (++reads === 1 ? drawn() : done()),
      [`PATCH ${ORG}`]: new ApiError(message, 409),
    })
    const tree = await mount()
    await pressPrefix(tree, 'Novo Horizonte, lugar 1 da chave')
    await pressPrefix(tree, 'Bola Murcha FC, lugar 2 da chave')
    expect(callsTo('GET', BRACKET)).toHaveLength(2)
    expect(allText(tree)).toContain(message)
    expect(findByPrefix(tree, 'Novo Horizonte, lugar 1 da chave')).toBeUndefined()
    expect(findButton(tree, 'Sortear de novo')).toBeUndefined()
    expect(findButton(tree, 'Ver e agendar partidas')).toBeTruthy()
  })

  it('409 ao sortear de novo (já confirmado em outra aba): relê e mostra o chaveamento confirmado', async () => {
    let reads = 0
    const message = 'O chaveamento já foi confirmado: não dá para sortear de novo.'
    serve({
      [BRACKET]: () => (++reads === 1 ? drawn() : done()),
      [`POST ${ORG}`]: new ApiError(message, 409),
    })
    const tree = await mount()
    await pressButton(tree, 'Sortear de novo')
    expect(callsTo('GET', BRACKET)).toHaveLength(2)
    expect(allText(tree)).toContain(message)
    expect(findButton(tree, 'Sortear de novo')).toBeUndefined()
    expect(findButton(tree, 'Confirmar chaveamento')).toBeUndefined()
  })

  it('com draw_blocker (as inscrições mudaram), o motivo aparece depois da árvore e a confirmação fica bloqueada', async () => {
    const reason = 'As inscrições confirmadas mudaram desde o sorteio. Sorteie de novo.'
    serve({ [BRACKET]: drawn(eightTeams, { permissions: { can_draw: true, can_swap: true, can_confirm: false, draw_blocker: reason } }) })
    const tree = await mount()
    expect(byId(tree, 'draw-blocker')).toHaveLength(1)
    expect(allText(tree)).toContain(reason)
    expect(isDisabled(tree, 'Confirmar chaveamento')).toBe(true)
    expect(allText(tree)).not.toContain('não dá mais para trocar')
    expect(callsTo('POST', `${ORG}/confirm`)).toHaveLength(0)
    // Sortear de novo continua permitido.
    expect(isDisabled(tree, 'Sortear de novo')).toBe(false)
  })

  it('o chaveamento confirmado de um evento encerrado mostra o campeão e as colocações (tênis com o bônus)', async () => {
    const people = ['Ana Souza', 'Beatriz Lima', 'Carla Dias', 'Dora Alves']
    const base = eliminationBracket(people, { sport: 'tenis', format: null }, true)
    const final = base.rounds[1].nodes[0]
    final.match = { ...final.match!, state: 'encerrada', phase: 'encerrada', score: score(2, 0) }
    final.slots[0].winner = true
    const champion = competitor(1, 'Ana Souza', 0, 'atleta')
    const ended = confirmed(base, {
      event_state: 'encerrado', champion,
      placements: [
        { placement: 1, competitor: champion, bonus_points: 40 },
        { placement: 2, competitor: competitor(3, 'Carla Dias', 2, 'atleta'), bonus_points: 20 },
        { placement: 3, competitor: competitor(2, 'Beatriz Lima', 1, 'atleta'), bonus_points: 10 },
      ],
    })
    serve({ [BRACKET]: ended })
    const tree = await mount()
    expect(byId(tree, 'champion')).toHaveLength(1)
    expect(labelled(tree, 'Campeão: Ana Souza')).toHaveLength(1)
    expect(allText(tree)).toContain('O campeonato terminou.')
    expect(labelled(tree, '1º lugar, Ana Souza, Campeão, mais 40 pontos no ranking')).toHaveLength(1)
    expect(labelled(tree, '2º lugar, Carla Dias, Vice-campeão, mais 20 pontos no ranking')).toHaveLength(1)
    expect(labelled(tree, '3º lugar, Beatriz Lima, Semifinalista, mais 10 pontos no ranking')).toHaveLength(1)
    expect(allText(tree)).toContain('+40 no ranking')
  })
})

describe('estados da tela', () => {
  it('erro de carregamento tem "Tentar novamente"; 401 chama onExpired; o voltar da barra volta', async () => {
    serve({ [BRACKET]: new ApiError('Este evento não tem chaveamento.', 404) })
    const tree = await mount()
    expect(allText(tree)).toContain('Este evento não tem chaveamento.')
    serve({ [BRACKET]: undrawn() })
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Sorteie o chaveamento')
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
    serve({ [BRACKET]: new ApiError('Sessão expirada', 401) })
    await mount()
    await flush()
    expect(onExpired).toHaveBeenCalled()
  })

  it('o título da barra é o nome do evento e, no todos contra todos, "Tabela"', async () => {
    serve({ [BRACKET]: roundRobinBracket() })
    const tree = await mount()
    expect(allText(tree)).toContain('Copa Sudoeste Society')
    expect(allText(tree)).toContain('Tabela')
  })
})
