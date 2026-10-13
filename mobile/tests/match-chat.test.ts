import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { MESSAGE_MAX } from '../src/api/matches'
import { COUNTER_FROM } from '../src/components/match/MatchChat'
import { mergeMessages } from '../src/hooks/useMatchChat'
import { colors } from '../src/theme'
import { appState, enableAct, hardwareBack } from './support/native'
import { matchRoutes, mountMatch, pressFake, tick, unmountAll } from './support/match'
import {
  arranging, caio, marcos, matchDetail, matchEvent, message, messagePage, mine, noPermissions, person, scheduled, sides, tiago,
} from './support/play'
import { allText, bodyOf, byId, callsTo, findButton, flush, hasField, labelled, pressButton, textsIn, typeInto } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Chat da partida (C1): lados, agrupamento, braçadeira, faixas de evento, mensagens removidas, leitura periódica com `after`
 * (pausada com o app em segundo plano), anteriores com `before`, envio com o limite de 1000 caracteres e denúncia de mensagem
 * pelo formulário de denúncias. Usa a tela da partida inteira, como a pessoa a vê.
 */

const FAKE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] as const
const MESSAGES = '/matches/1/messages'

beforeEach(() => {
  enableAct()
  appState.reset()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(async () => {
  await unmountAll()
  vi.useRealTimers()
  appState.reset()
})

const groups = (tree: ReactTestRenderer) => byId(tree, 'chat-group')
const bubbles = (node: { findAll: ReactTestRenderer['root']['findAll'] }) => node.findAll(item => item.props.testID === 'chat-bubble' && typeof item.type === 'string')
const bubbleTexts = (tree: ReactTestRenderer) => byId(tree, 'chat-bubble').map(item => textsIn(item).join(''))
const style = (node: { props: { style?: unknown } }) => node.props.style as Record<string, unknown>
const input = (tree: ReactTestRenderer) => tree.root.findAllByType('TextInput' as never).find(item => item.props.accessibilityLabel === 'Mensagem')!

describe('lados, agrupamento e braçadeira', () => {
  it('acesso histórico mostra a restrição e não lê mensagens', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ my_role: 'historico', state: 'encerrada', permissions: { ...noPermissions } })))
    expect(allText(tree)).toContain('Chat indisponível no histórico')
    expect(byId(tree, 'chat-log')).toHaveLength(0)
    expect(callsTo('GET', '/matches/1/messages')).toHaveLength(0)
  })
  const conversation = [
    message(1, { body: 'Boa tarde!', author: caio, side: 'b', author_role: 'representante' }),
    message(2, { body: 'Sábado fica bom?', author: caio, side: 'b', author_role: 'representante' }),
    mine(3, 'Fica sim, depois das 15h.'),
    message(4, { body: 'Sábado eu consigo.', author: tiago, side: 'a', author_role: 'membro' }),
    message(5, { body: 'Levo os coletes.', author: marcos, side: 'a', author_role: 'avulso' }),
  ]

  it('o meu time à direita (eu em verde-escuro, colegas em verde-claro) e o adversário à esquerda, em branco', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage(conversation) }))
    const [opponent, me, teammate, guest] = groups(tree)
    expect(groups(tree)).toHaveLength(4)
    // Adversário: à esquerda, bolhas brancas.
    expect(style(opponent).alignSelf).toBe('flex-start')
    expect(bubbles(opponent).map(item => style(item).backgroundColor)).toEqual(['#ffffff', '#ffffff'])
    // Eu: à direita, verde-escuro, com o nome "Você".
    expect(style(me).alignSelf).toBe('flex-end')
    expect(textsIn(me)).toContain('Você')
    expect(bubbles(me).map(item => style(item).backgroundColor)).toEqual([colors.brand])
    // Colegas de time e avulso do meu lado: à direita, em verde-claro.
    for (const group of [teammate, guest]) {
      expect(style(group).alignSelf).toBe('flex-end')
      expect(bubbles(group).map(item => style(item).backgroundColor)).toEqual(['#d5e9dc'])
    }
    expect(textsIn(teammate)).toContain('Tiago Melo')
  })

  it('agrupa mensagens seguidas da mesma pessoa: nome, time e hora uma vez só; um evento quebra o grupo', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([
        message(1, { body: 'Primeira' }), message(2, { body: 'Segunda' }),
        matchEvent(3, 'reserva_atualizada', 'Leões do Cerrado confirmou a reserva da quadra.', { side: 'b' }),
        message(4, { body: 'Terceira' }),
      ]),
    }))
    expect(groups(tree)).toHaveLength(2)
    const [first, second] = groups(tree)
    expect(textsIn(first).filter(text => text === 'Caio Ramos')).toHaveLength(1)
    expect(bubbles(first).map(item => textsIn(item).join(''))).toEqual(['Primeira', 'Segunda'])
    expect(textsIn(first)).toContain('Leões')
    expect(bubbles(second).map(item => textsIn(item).join(''))).toEqual(['Terceira'])
    expect(byId(tree, 'chat-event')).toHaveLength(1)
  })

  it('separa os dias com "Hoje" e mostra a hora de cada grupo', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage([message(1, { created_at: new Date().toISOString() })]) }))
    expect(byId(tree, 'chat-day').map(item => textsIn(item).join(''))).toEqual(['Hoje'])
    expect(textsIn(groups(tree)[0]).some(text => /^\d\d:\d\d$/.test(text))).toBe(true)
  })

  it('mostra a braçadeira "C" só para representantes, com o rótulo "Representante"', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage(conversation) }))
    const [opponent, me, teammate, guest] = groups(tree)
    const armbands = (node: typeof opponent) => node.findAll(item => typeof item.type === 'string' && item.props.accessibilityLabel === 'Representante')
    expect(armbands(opponent)).toHaveLength(1)
    expect(armbands(me)).toHaveLength(1)
    expect(armbands(teammate)).toHaveLength(0)
    expect(armbands(guest)).toHaveLength(0)
  })

  it('mostra os eventos da partida como faixas, com a data no fuso do aparelho', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([
        matchEvent(1, 'partida_combinando', 'Proposta aceita pelos dois lados. Combinem dia, horário e quadra.'),
        matchEvent(2, 'condicoes_propostas', 'Leões do Cerrado propôs condições na quadra Arena Sudoeste.', { side: 'b', payload: { starts_at: '2026-10-20T22:00:00Z' } }),
      ]),
    }))
    const strips = byId(tree, 'chat-event')
    expect(strips).toHaveLength(2)
    expect(textsIn(strips[0]).join('')).toContain('Proposta aceita pelos dois lados.')
    // A data vem de payload.starts_at (o texto do evento não traz datas); a faixa do time leva o brasão dele.
    expect(textsIn(strips[1]).join('')).toMatch(/^ter, 20 out · \d\d:\d\d · Leões do Cerrado propôs condições na quadra Arena Sudoeste\.\d\d:\d\d$/)
    expect(strips[1].findAll(item => typeof item.type === 'string' && item.props.accessibilityLabel === 'Brasão de Leões do Cerrado')).toHaveLength(0)
  })

  it('mensagens removidas aparecem como "Mensagem removida", sem texto e sem denúncia', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage([message(1, { body: null, removed: true }), message(2, { body: 'Visível' })]) }))
    expect(byId(tree, 'chat-removed')).toHaveLength(1)
    expect(allText(tree)).toContain('Mensagem removida')
    expect(bubbleTexts(tree)).toEqual(['Visível'])
    expect(labelled(tree, 'Denunciar mensagem de Caio Ramos')).toHaveLength(1)
  })

  it('chat vazio e erro ao carregar', async () => {
    const empty = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage([]) }))
    expect(allText(empty.tree)).toContain('Nenhuma mensagem ainda. Combinem dia, horário e quadra por aqui.')
    await unmountAll()
    const failed = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: new ApiError('O chat abre quando os dois lados aceitam a proposta.', 403) }))
    expect(allText(failed.tree)).toContain('O chat abre quando os dois lados aceitam a proposta.')
    expect(allText(failed.tree)).not.toContain('Nenhuma mensagem ainda')
  })

  it('junta mensagens sem repetir ids e em ordem', () => {
    const merged = mergeMessages([message(1), message(3)], [message(2), message(3, { body: 'editada' })])
    expect(merged.map(item => item.id)).toEqual([1, 2, 3])
    expect(merged[2].body).toBe('editada')
    const same = [message(1)]
    expect(mergeMessages(same, [])).toBe(same)
  })
})

describe('leitura periódica', () => {
  it('substitui o texto já carregado ao receber uma remoção incremental', async () => {
    vi.useFakeTimers()
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([message(1, { body: 'Texto moderado' })]),
      [`${MESSAGES}?after=1`]: messagePage([matchEvent(2, 'mensagem_removida', 'Uma mensagem foi removida pela administração.', { payload: { message_id: 1 } })]),
      [`${MESSAGES}?after=2`]: messagePage([], { last_id: 2 }),
    }), { fake: true })
    expect(allText(tree)).toContain('Texto moderado')
    await tick(4000)
    expect(allText(tree)).not.toContain('Texto moderado')
    expect(allText(tree)).toContain('Mensagem removida')
  })
  it('uma página antiga tardia não restaura o texto removido', () => {
    const removal = matchEvent(2, 'mensagem_removida', 'Removida', { payload: { message_id: 1 } })
    const merged = mergeMessages([removal], [message(1, { body: 'Resposta antiga' })])
    expect(merged[0].body).toBeNull()
    expect(merged[0].removed).toBe(true)
  })
  const live = async (routes: Record<string, unknown>, detail = matchDetail()) => {
    vi.useFakeTimers({ toFake: [...FAKE] })
    return await mountMatch(matchRoutes(detail, routes as never), { fake: true })
  }

  it('lê só as novas com after a cada 4 s, sem recarregar a tela', async () => {
    let reads = 0
    const { tree } = await live({
      [MESSAGES]: messagePage([message(1), message(2, { body: 'Segunda' })]),
      [`${MESSAGES}?after=2`]: () => (++reads === 1 ? messagePage([message(3, { body: 'Chegou sozinha' })]) : messagePage([], { last_id: 3 })),
      [`${MESSAGES}?after=3`]: messagePage([], { last_id: 3 }),
    })
    expect(bubbleTexts(tree)).toContain('Segunda')
    expect(callsTo('GET', MESSAGES)).toHaveLength(1)
    expect(bubbleTexts(tree)).not.toContain('Chegou sozinha')

    await tick(4000)
    expect(callsTo('GET', `${MESSAGES}?after=2`)).toHaveLength(1)
    expect(bubbleTexts(tree)).toContain('Chegou sozinha')
    // O cursor avança: a próxima leitura usa o último id recebido.
    await tick(4000)
    expect(callsTo('GET', `${MESSAGES}?after=3`).length).toBeGreaterThan(0)
    await tick(8000)
    expect(callsTo('GET', `${MESSAGES}?after=3`).length).toBeGreaterThan(1)
    expect(callsTo('GET', '/matches/1')).toHaveLength(1)
    // A leitura periódica é em segundo plano: uma queda de conexão liga só a faixa, nunca a folha.
    expect(callsTo('GET', MESSAGES)[0][3]).toEqual({ background: true })
    expect(callsTo('GET', `${MESSAGES}?after=2`)[0][3]).toEqual({ background: true })
  })

  it('pausa a leitura com o app em segundo plano e lê na hora ao voltar', async () => {
    await live({ [MESSAGES]: messagePage([message(1)]), [`${MESSAGES}?after=1`]: messagePage([], { last_id: 1 }) })
    await tick(4000)
    const before = callsTo('GET', `${MESSAGES}?after=1`).length
    expect(before).toBeGreaterThan(0)

    await act(async () => { appState.set('background') })
    await tick(20_000)
    expect(callsTo('GET', `${MESSAGES}?after=1`)).toHaveLength(before)

    await act(async () => { appState.set('active') })
    await tick(50)
    expect(callsTo('GET', `${MESSAGES}?after=1`)).toHaveLength(before + 1)
    // E segue de 4 em 4 s.
    await tick(4000)
    expect(callsTo('GET', `${MESSAGES}?after=1`)).toHaveLength(before + 2)
  })

  it('com o app em segundo plano desde o começo, a primeira leitura acontece e nenhuma outra se agenda', async () => {
    await live({ [MESSAGES]: messagePage([message(1)]), [`${MESSAGES}?after=1`]: messagePage([], { last_id: 1 }) })
    await act(async () => { appState.set('background') })
    await tick(30_000)
    expect(callsTo('GET', MESSAGES)).toHaveLength(1)
    expect(callsTo('GET', `${MESSAGES}?after=1`)).toHaveLength(0)
  })

  it('partida encerrada: continua recebendo remoções a cada 30 s e ao voltar ao app', async () => {
    const { tree } = await live({
      [MESSAGES]: messagePage([message(1, { body: 'Foi um jogão' })]),
      [`${MESSAGES}?after=1`]: messagePage([matchEvent(2, 'mensagem_removida', 'Uma mensagem foi removida pela administração.', { payload: { message_id: 1 } })]),
      [`${MESSAGES}?after=2`]: messagePage([], { last_id: 2 }),
    },
      matchDetail({ state: 'encerrada', phase: 'encerrada', permissions: { ...noPermissions, read_chat: true } }))
    expect(bubbleTexts(tree)).toEqual(['Foi um jogão'])
    await tick(30_000)
    expect(allText(tree)).not.toContain('Foi um jogão')
    expect(allText(tree)).toContain('Mensagem removida')
    await act(async () => { appState.set('background') })
    await act(async () => { appState.set('active') })
    await tick(50)
    expect(callsTo('GET', MESSAGES)).toHaveLength(1)
    expect(callsTo('GET', `${MESSAGES}?after=1`)).toHaveLength(1)
    expect(callsTo('GET', `${MESSAGES}?after=2`)).toHaveLength(1)
  })

  it('com mais mensagens novas do que cabem numa página, lê de novo na hora', async () => {
    const { tree } = await live({
      [MESSAGES]: messagePage([message(1)]),
      [`${MESSAGES}?after=1`]: messagePage([message(2)], { has_more: true }),
      [`${MESSAGES}?after=2`]: messagePage([message(3)]),
    })
    await tick(4000)
    expect(callsTo('GET', `${MESSAGES}?after=2`)).toHaveLength(1)
    expect(bubbleTexts(tree)).toContain('Mensagem 3')
  })

  it('falha de rede avisa "Sem conexão" e a leitura seguinte recupera', async () => {
    let reads = 0
    const { tree } = await live({
      [MESSAGES]: messagePage([message(1)]),
      [`${MESSAGES}?after=1`]: () => (++reads === 1 ? new ApiError('Falha.', 500) : messagePage([message(2, { body: 'Voltou' })])),
    })
    await tick(4000)
    expect(bubbleTexts(tree)).not.toContain('Voltou')
    expect(allText(tree)).toContain('Sem conexão. Tentando de novo…')
    await tick(4000)
    expect(bubbleTexts(tree)).toContain('Voltou')
    expect(allText(tree)).not.toContain('Sem conexão')
  })

  it('sessão expirada durante a leitura chama onExpired e para de ler', async () => {
    const { onExpired } = await live({ [MESSAGES]: new ApiError('Sessão expirada.', 401) })
    expect(onExpired).toHaveBeenCalled()
    await tick(20_000)
    expect(callsTo('GET', MESSAGES)).toHaveLength(1)
  })

  it('chat fechado para quem lê (403): mostra o aviso e não insiste', async () => {
    const { tree } = await live({ [MESSAGES]: new ApiError('O chat abre quando os dois lados aceitam a proposta.', 403) })
    expect(allText(tree)).toContain('O chat abre quando os dois lados aceitam a proposta.')
    await tick(20_000)
    expect(callsTo('GET', MESSAGES)).toHaveLength(1)
  })

  it('um evento novo da partida (aceite, cancelamento…) faz a tela reler o detalhe', async () => {
    let reads = 0
    const { tree } = await live({
      '/matches/1': () => (++reads === 1 ? matchDetail() : scheduled(72)),
      [MESSAGES]: messagePage([message(1)]),
      [`${MESSAGES}?after=1`]: messagePage([matchEvent(2, 'partida_agendada', 'Partida agendada na quadra Arena Sudoeste.', { side: 'b' })], { last_id: 2 }),
      [`${MESSAGES}?after=2`]: messagePage([], { last_id: 2 }),
    })
    expect(allText(tree)).toContain('Combinando')
    await tick(4000)
    await tick(50)
    expect(callsTo('GET', '/matches/1')).toHaveLength(2)
    expect(allText(tree)).toContain('Agendada')
  })
})

describe('rolagem e mensagens anteriores', () => {
  it('rolando para cima, as mensagens novas só avisam e o botão leva ao fim da conversa', async () => {
    vi.useFakeTimers({ toFake: [...FAKE] })
    const scrollToEnd = vi.fn()
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([message(1)]),
      [`${MESSAGES}?after=1`]: messagePage([message(2, { body: 'Nova' })]),
      [`${MESSAGES}?after=2`]: messagePage([], { last_id: 2 }),
    }), { fake: true, nodes: type => (type === 'ScrollView' ? { scrollToEnd } : null) })
    // A primeira leitura leva ao fim.
    expect(scrollToEnd).toHaveBeenCalled()
    scrollToEnd.mockClear()
    const log = byId(tree, 'chat-log')[0]
    await act(async () => { log.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 300 }, contentSize: { height: 1000 } } }) })
    await tick(4000)
    expect(bubbleTexts(tree)).toContain('Nova')
    expect(scrollToEnd).not.toHaveBeenCalled()
    expect(findButton(tree, '1 nova mensagem')).toBeTruthy()
    await pressFake(tree, '1 nova mensagem')
    expect(scrollToEnd).toHaveBeenCalledOnce()
    expect(findButton(tree, '1 nova mensagem')).toBeUndefined()
  })

  it('perto do fim, o chat acompanha as mensagens novas', async () => {
    vi.useFakeTimers({ toFake: [...FAKE] })
    const scrollToEnd = vi.fn()
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([message(1)]),
      [`${MESSAGES}?after=1`]: messagePage([message(2, { body: 'Nova' })]),
      [`${MESSAGES}?after=2`]: messagePage([], { last_id: 2 }),
    }), { fake: true, nodes: type => (type === 'ScrollView' ? { scrollToEnd } : null) })
    scrollToEnd.mockClear()
    await act(async () => { byId(tree, 'chat-log')[0].props.onScroll({ nativeEvent: { contentOffset: { y: 640 }, layoutMeasurement: { height: 300 }, contentSize: { height: 1000 } } }) })
    await tick(4000)
    expect(scrollToEnd).toHaveBeenCalledOnce()
    expect(findButton(tree, '1 nova mensagem')).toBeUndefined()
  })

  it('carrega as anteriores com before e as coloca no topo', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([message(11, { body: 'Décima primeira' })], { has_more: true }),
      [`${MESSAGES}?before=11`]: messagePage([message(9, { body: 'Nona' }), message(10, { body: 'Décima' })]),
    }))
    await pressButton(tree, 'Carregar anteriores')
    expect(callsTo('GET', `${MESSAGES}?before=11`)).toHaveLength(1)
    expect(findButton(tree, 'Carregar anteriores')).toBeUndefined()
    expect(bubbleTexts(tree)).toEqual(['Nona', 'Décima', 'Décima primeira'])
  })

  it('o erro ao carregar as anteriores não apaga a conversa', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([message(11, { body: 'Décima primeira' })], { has_more: true }),
      [`${MESSAGES}?before=11`]: new ApiError('Não deu para carregar.', 500),
    }))
    await pressButton(tree, 'Carregar anteriores')
    expect(bubbleTexts(tree)).toEqual(['Décima primeira'])
    expect(findButton(tree, 'Carregar anteriores')).toBeTruthy()
  })
})

describe('envio', () => {
  const send = (tree: ReactTestRenderer) => findButton(tree, 'Enviar mensagem')!

  it('o botão Enviar só vale com texto: envia aparado, limpa o campo e a mensagem entra no meu lado', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([message(1)]),
      'POST /matches/1/messages': (call: { body: unknown }) => mine(2, (call.body as { body: string }).body),
    }))
    expect(send(tree).props.disabled).toBe(true)
    await typeInto(tree, 'Mensagem', '   ')
    expect(send(tree).props.disabled).toBe(true)
    await typeInto(tree, 'Mensagem', '  Primeira linha\nSegunda linha  ')
    expect(send(tree).props.disabled).toBe(false)
    expect(callsTo('POST', MESSAGES)).toHaveLength(0)
    await pressButton(tree, 'Enviar mensagem')
    expect(bodyOf('POST', MESSAGES)).toEqual({ body: 'Primeira linha\nSegunda linha' })
    expect(input(tree).props.value).toBe('')
    expect(send(tree).props.disabled).toBe(true)
    const sent = groups(tree).find(group => style(group).alignSelf === 'flex-end')!
    expect(bubbles(sent).map(item => textsIn(item).join(''))).toEqual(['Primeira linha\nSegunda linha'])
    expect(bubbles(sent).map(item => style(item).backgroundColor)).toEqual([colors.brand])
  })

  it('anuncia o envio e o erro; o texto digitado fica para tentar de novo', async () => {
    let finish!: () => void
    const wait = new Promise<void>(resolve => { finish = resolve })
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([]),
      'POST /matches/1/messages': async () => { await wait; return new ApiError('O chat desta partida está fechado.', 409) },
    }))
    await typeInto(tree, 'Mensagem', 'Oi')
    await act(async () => { send(tree).props.onPress() })
    expect(allText(tree)).toContain('Enviando mensagem…')
    expect(send(tree).props.disabled).toBe(true)
    expect(send(tree).props.accessibilityState.busy).toBe(true)
    await act(async () => { finish() })
    await flush()
    expect(allText(tree)).toContain('O chat desta partida está fechado.')
    expect(input(tree).props.value).toBe('Oi')
    expect(send(tree).props.disabled).toBe(false)
  })

  it('respeita o limite de 1000 caracteres e mostra a contagem perto dele', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage([]), 'POST /matches/1/messages': (call: { body: unknown }) => mine(2, (call.body as { body: string }).body) }))
    expect(input(tree).props.maxLength).toBe(MESSAGE_MAX)
    await typeInto(tree, 'Mensagem', 'x'.repeat(COUNTER_FROM - 1))
    expect(byId(tree, 'chat-counter')).toHaveLength(0)
    await typeInto(tree, 'Mensagem', 'x'.repeat(COUNTER_FROM))
    expect(textsIn(byId(tree, 'chat-counter')[0])).toEqual([`${COUNTER_FROM}/${MESSAGE_MAX} caracteres`])
    await typeInto(tree, 'Mensagem', 'x'.repeat(MESSAGE_MAX + 5))
    expect(input(tree).props.value).toHaveLength(MESSAGE_MAX)
    expect(textsIn(byId(tree, 'chat-counter')[0])).toEqual([`${MESSAGE_MAX}/${MESSAGE_MAX} caracteres`])
    await pressButton(tree, 'Enviar mensagem')
    expect((bodyOf('POST', MESSAGES) as { body: string }).body).toHaveLength(MESSAGE_MAX)
  })

  it('a dica do campo é a do futebol ou a do tênis', async () => {
    const football = await mountMatch(matchRoutes(matchDetail()))
    expect(input(football.tree).props.placeholder).toBe('Mensagem para os dois times')
    await unmountAll()
    const tennis = await mountMatch(matchRoutes(matchDetail({ sport: 'tenis', format: null, my_role: 'atleta' })))
    expect(input(tennis.tree).props.placeholder).toBe('Mensagem para a partida')
  })

  it('chat fechado: o campo some e o motivo aparece (partida cancelada, administração)', async () => {
    const closed = await mountMatch(matchRoutes(matchDetail({ state: 'cancelada', phase: 'cancelada', permissions: { ...noPermissions, read_chat: true } })))
    expect(hasField(closed.tree, 'Mensagem')).toBe(false)
    expect(allText(closed.tree)).toContain('O chat desta partida está fechado.')
    await unmountAll()
    const admin = await mountMatch(matchRoutes(matchDetail({ my_role: 'administracao', my_side: null, permissions: { ...noPermissions, read_chat: true } })))
    expect(allText(admin.tree)).toContain('A administração só lê o chat.')
  })

  it('o atalho de propor condições só existe para quem pode propor', async () => {
    const withShortcut = await mountMatch(matchRoutes(matchDetail({ permissions: arranging })))
    expect(findButton(withShortcut.tree, 'Propor dia, horário e quadra')).toBeTruthy()
    await unmountAll()
    const without = await mountMatch(matchRoutes(matchDetail({ permissions: { ...arranging, propose_terms: false } })))
    expect(findButton(without.tree, 'Propor dia, horário e quadra')).toBeUndefined()
  })
})

describe('organizador no chat (campeonato)', () => {
  const eventRef = { id: 5, name: 'Copa Sudoeste Society' }
  const organizerMessage = (id: number, overrides: Parameters<typeof message>[1] = {}) => message(id, {
    body: 'Os dois times: o jogo é às 16h.', author: person(9, 'Rafa Nunes'), side: null, author_role: 'organizador', ...overrides,
  })
  const championship = (overrides: Parameters<typeof matchDetail>[0] = {}) => matchDetail({
    origin: 'campeonato', event: eventRef, round_number: 1, permissions: { ...noPermissions, read_chat: true, write_chat: true }, ...overrides,
  })

  it('o time vê a mensagem do organizador com a etiqueta "Organizador", sem o nome de um time', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({ my_role: 'representante' }), {
      [MESSAGES]: messagePage([message(1, { body: 'Bom jogo!', author: caio, side: 'b', author_role: 'representante' }), organizerMessage(2)]),
    }))
    const [opponent, organizer] = groups(tree)
    expect(byId(tree, 'organizer-tag')).toHaveLength(1)
    expect(textsIn(organizer)).toContain('Organizador')
    expect(textsIn(organizer)).toContain('Rafa Nunes')
    expect(textsIn(organizer)).not.toContain('Leões')
    // A mensagem de um time continua com o nome do time, sem a etiqueta.
    expect(textsIn(opponent)).toContain('Leões')
    expect(opponent.findAll(item => item.props.testID === 'organizer-tag')).toHaveLength(0)
    expect(style(organizer).alignSelf).toBe('flex-start')
  })

  it('o organizador escreve no chat e vê a própria mensagem à direita, como "Você"', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({ my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }, { is_mine: false }) }), {
      [MESSAGES]: messagePage([organizerMessage(2, { is_mine: true }), matchEvent(3, 'resultado_decidido', 'O organizador decidiu o resultado.')]),
    }))
    const [group] = groups(tree)
    expect(textsIn(group)).toContain('Você')
    expect(textsIn(group)).toContain('Organizador')
    expect(style(group).alignSelf).toBe('flex-end')
    expect(input(tree).props.placeholder).toBe('Mensagem para os dois times')
    expect(textsIn(byId(tree, 'chat-event')[0]).join('')).toContain('O organizador decidiu o resultado.')
  })

  it('o campeonato vazio não pede para combinar dia e horário', async () => {
    const { tree } = await mountMatch(matchRoutes(championship(), { [MESSAGES]: messagePage([]) }))
    expect(allText(tree)).toContain('Nenhuma mensagem ainda. Conversem por aqui.')
  })
})

describe('denúncia de mensagem', () => {
  const offensive = message(7, { body: 'Texto ofensivo.' })

  it('abre o formulário com a mensagem, envia como match_message e avisa que a denúncia foi enviada', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([offensive, mine(8, 'Minha mensagem')]),
      'POST /reports': { id: 1, status: 'pending' },
    }))
    // Só as mensagens dos outros têm o botão de denunciar.
    expect(labelled(tree, 'Denunciar mensagem de Caio Ramos')).toHaveLength(1)
    await pressButton(tree, 'Denunciar mensagem de Caio Ramos')
    expect(allText(tree)).toContain('Denunciar mensagem')
    expect(allText(tree)).toContain('Texto ofensivo.')
    expect(allText(tree)).toContain('A administração vê a mensagem, a partida e o autor.')
    expect(allText(tree)).toContain('Por que você quer denunciar esta mensagem?')
    await pressButton(tree, 'Assédio')
    await pressButton(tree, 'Enviar denúncia')
    expect(bodyOf('POST', '/reports')).toEqual({ target_type: 'match_message', target_id: 7, reason: 'assedio' })
    expect(allText(tree)).toContain('Denúncia da mensagem enviada.')
    await pressButton(tree, 'Concluir')
    expect(allText(tree)).not.toContain('A administração vê a mensagem, a partida e o autor.')
    expect(allText(tree)).toContain('Denúncia enviada para análise.')
  })

  it('o erro do servidor fica no formulário e o 401 volta ao login', async () => {
    const { tree, onExpired } = await mountMatch(matchRoutes(matchDetail(), {
      [MESSAGES]: messagePage([offensive]),
      'POST /reports': new ApiError('Sessão expirada.', 401),
    }))
    await pressButton(tree, 'Denunciar mensagem de Caio Ramos')
    await pressButton(tree, 'Spam')
    await pressButton(tree, 'Enviar denúncia')
    expect(onExpired).toHaveBeenCalled()
    expect(allText(tree)).toContain('Sessão expirada.')
    expect(allText(tree)).toContain('A administração vê a mensagem, a partida e o autor.')
  })

  it('o voltar do Android fecha o formulário em vez de sair da partida; sem ele aberto, o voltar segue para a navegação', async () => {
    // O voltar da navegação (que sairia da partida) é registrado antes da tela, como o `useAndroidBack` do shell.
    hardwareBack.handlers.length = 0
    const leaveMatch = vi.fn(() => true)
    hardwareBack.handlers.push(leaveMatch)
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage([offensive]) }))
    await act(async () => { expect(hardwareBack.press()).toBe(true) })
    expect(leaveMatch).toHaveBeenCalledTimes(1)
    await pressButton(tree, 'Denunciar mensagem de Caio Ramos')
    expect(allText(tree)).toContain('A administração vê a mensagem, a partida e o autor.')
    leaveMatch.mockClear()
    await act(async () => { expect(hardwareBack.press()).toBe(true) })
    expect(leaveMatch).not.toHaveBeenCalled()
    expect(allText(tree)).not.toContain('A administração vê a mensagem, a partida e o autor.')
    expect(callsTo('POST', '/reports')).toHaveLength(0)
    // Fechado o formulário, o ouvinte do vidro sai e o voltar volta a sair da partida.
    await act(async () => { expect(hardwareBack.press()).toBe(true) })
    expect(leaveMatch).toHaveBeenCalledTimes(1)
    hardwareBack.handlers.length = 0
  })

  it('fechar o formulário não envia nada', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [MESSAGES]: messagePage([offensive]) }))
    await pressButton(tree, 'Denunciar mensagem de Caio Ramos')
    await pressButton(tree, 'Fechar')
    expect(allText(tree)).not.toContain('A administração vê a mensagem, a partida e o autor.')
    expect(callsTo('POST', '/reports')).toHaveLength(0)
  })
})
