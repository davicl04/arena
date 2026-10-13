import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import AdminCourtSuggestionsScreen from '../src/screens/AdminCourtSuggestionsScreen'
import AdminWalkoverDisputesScreen from '../src/screens/AdminWalkoverDisputesScreen'
import { enableAct } from './support/native'
import type { Call } from './support/review'
import {
  admin, allText, bodyOf, byId, callsTo, findButton, flush, hasField, isDisabled, labelled, me, page, pressButton, pressPrefix, render, serve, typeInto,
} from './support/review'
import { athleteSide } from './support/play'
import { chatLine, court, dispute, disputeMatch, ferrugem, fromNow, rafa, suggestion, team, tigres } from './support/admin-match'
import { toastText, toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const PENDING = '/admin/court-suggestions?state=em_revisao'
const DECIDED = '/admin/court-suggestions?state=decididas'
const DISPUTES = '/admin/walkover-disputes'
const CHAT = '/matches/12/messages?limit=12'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

describe('Filas de quadras e de W.O.: acesso', () => {
  it.each([
    ['Sugestões de quadra', AdminCourtSuggestionsScreen],
    ['W.O. contestados', AdminWalkoverDisputesScreen],
  ] as const)('%s: quem não é administrador vê o aviso e nenhuma requisição é feita', async (_name, Screen) => {
    serve({})
    const tree = await render(h(Screen, { user: me, onExpired: vi.fn() }))
    expect(byId(tree, 'admin-denied')).toHaveLength(1)
    expect(allText(tree)).toContain('Esta área é só para a administração do Arena.')
    expect(vi.mocked(request)).not.toHaveBeenCalled()
  })
})

describe('Sugestões de quadra', () => {
  const duplicate = court({ id: 55, name: 'Arena Sul Oficial', address: 'SGAS 910', state: 'publicada', provisional: false })
  const mount = (onExpired = vi.fn()) => render(h(AdminCourtSuggestionsScreen, { user: admin, onExpired }))
  function world(extra: Record<string, unknown> = {}) {
    const state = { open: [suggestion(), suggestion({ court: court({ id: 42, name: 'Quadra do Lago', address: null }), possible_duplicates: [duplicate], origin_match: null, suggested_by: null })] }
    serve({
      [PENDING]: () => page(state.open),
      [DECIDED]: page([
        suggestion({ court: court({ id: 50, name: 'Campo Norte', state: 'publicada', provisional: false }), reviewed_at: fromNow(-1) }),
        suggestion({ court: court({ id: 51, name: 'Quadra Fantasma', state: 'rejeitada' }), reviewed_at: fromNow(-2), review_reason: 'Endereço inexistente.' }),
        suggestion({ court: court({ id: 52, name: 'Arena Sul 2', state: 'rejeitada' }), reviewed_at: fromNow(-3), duplicate_of: duplicate, review_reason: null }),
      ]),
      '/matches/12': { id: 12, sides: [ferrugem, tigres] },
      'POST /admin/court-suggestions/41/decision': ({ body }: Call) => {
        state.open = state.open.filter(item => item.court.id !== 41)
        return suggestion({ court: court({ state: (body as { decision: string }).decision === 'publicar' ? 'publicada' : 'rejeitada', provisional: false }) })
      },
      ...extra,
    })
    return state
  }

  it('lista as sugestões a analisar, com a duplicidade possível sinalizada, e as decididas só para leitura', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Para analisar')
    expect(text).toContain('Arena Sul')
    expect(text).toContain('SGAS 910, Asa Sul')
    expect(text).toContain('Society · Brasília · DF')
    expect(text).toContain('Sugerida por Rafa Nunes há 3 horas · partida #12')
    expect(text).toContain('Quadra do Lago')
    expect(text).toContain('Sem endereço')
    expect(text).toContain('Sugerida por conta removida')
    expect(text).toContain('Possível duplicidade')
    await pressButton(tree, 'Decididas')
    const decided = allText(tree)
    expect(decided).toContain('Campo Norte')
    expect(decided).toContain('Publicada')
    expect(decided).toContain('Quadra Fantasma')
    expect(decided).toContain('Rejeitada')
    expect(decided).toContain('Endereço inexistente.')
    expect(decided).toContain('Duplicada de Arena Sul Oficial')
    // Decididas não abrem folha.
    expect(findButton(tree, 'Campo Norte')).toBeUndefined()
  })

  it('filas vazias explicam o que aparece ali', async () => {
    serve({ [PENDING]: page([]), [DECIDED]: page([]) })
    const tree = await mount()
    expect(allText(tree)).toContain('Nada para analisar')
    expect(allText(tree)).toContain('Quando um time sugerir uma quadra que não está no catálogo, ela aparece aqui.')
    await pressButton(tree, 'Decididas')
    expect(allText(tree)).toContain('Nenhuma sugestão decidida')
  })

  it('a folha mostra os dados, o autor e a partida de origem com os nomes dos lados', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    const sheet = allText(tree)
    expect(sheet).toContain('Sugestão de quadra')
    expect(sheet).toContain('Society')
    expect(sheet).toContain('Rafa Nunes · há 3 horas')
    expect(sheet).toContain('Ferrugem FC × Tigres do Lago')
    expect(sheet).toMatch(/Partida #12 · Society · \w{3}, 20 out · \d{2}:\d{2}/)
    expect(labelled(tree, 'Possível duplicidade')).toHaveLength(0)
  })

  it('a duplicidade possível lista as quadras parecidas do catálogo', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Quadra do Lago.')
    expect(labelled(tree, 'Possível duplicidade')).toHaveLength(1)
    expect(allText(tree)).toContain('Arena Sul Oficial · SGAS 910')
    expect(allText(tree)).toContain('Conta removida')
  })

  it('publica sem correções: corpo só com a decisão, a linha sai da fila e o aviso é anunciado', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Publicar')
    expect(hasField(tree, 'Nome da quadra')).toBe(true)
    await pressButton(tree, 'Publicar quadra')
    expect(bodyOf('POST', '/admin/court-suggestions/41/decision')).toEqual({ decision: 'publicar' })
    expect(toastText()).toContain('Arena Sul entrou no catálogo de Brasília.')
    expect(findButton(tree, 'Publicar quadra')).toBeUndefined()
    expect(allText(tree)).not.toContain('SGAS 910, Asa Sul')
  })

  it('publica corrigindo nome e endereço; nome inválido não envia', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Publicar')
    await typeInto(tree, 'Nome da quadra', 'A')
    await pressButton(tree, 'Publicar quadra')
    expect(allText(tree)).toContain('O nome da quadra precisa ter de 2 a 80 caracteres.')
    expect(callsTo('POST', '/admin/court-suggestions/41/decision')).toHaveLength(0)
    await typeInto(tree, 'Nome da quadra', '  Arena Sul Guará  ')
    await typeInto(tree, 'Endereço (opcional)', '')
    await pressButton(tree, 'Publicar quadra')
    expect(bodyOf('POST', '/admin/court-suggestions/41/decision')).toEqual({ decision: 'publicar', name: 'Arena Sul Guará', address: null })
  })

  it('"Voltar" desfaz o painel de publicação e volta às duas escolhas', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Publicar')
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'Rejeitar')).toBeTruthy()
    expect(findButton(tree, 'Publicar quadra')).toBeUndefined()
  })

  it('rejeitar exige o motivo (5 a 300) e envia aparado', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Rejeitar')
    await pressButton(tree, 'Rejeitar sugestão')
    expect(allText(tree)).toContain('Descreva o motivo da recusa, de 5 a 300 caracteres.')
    expect(callsTo('POST', '/admin/court-suggestions/41/decision')).toHaveLength(0)
    await typeInto(tree, 'Motivo da recusa (obrigatório)', '  Endereço não existe  ')
    await pressButton(tree, 'Rejeitar sugestão')
    expect(bodyOf('POST', '/admin/court-suggestions/41/decision')).toEqual({ decision: 'rejeitar', reason: 'Endereço não existe' })
    expect(toastText()).toContain('Sugestão Arena Sul rejeitada.')
  })

  it('rejeitar como duplicada aponta a quadra do catálogo e dispensa o motivo; "Não é duplicada" volta ao motivo obrigatório', async () => {
    world({ 'POST /admin/court-suggestions/42/decision': suggestion({ court: court({ id: 42, name: 'Quadra do Lago', state: 'rejeitada' }) }) })
    const tree = await mount()
    await pressPrefix(tree, 'Quadra do Lago.')
    await pressButton(tree, 'Rejeitar')
    await pressButton(tree, 'Duplicada: Arena Sul Oficial')
    expect(allText(tree)).toContain('passam a usar Arena Sul Oficial, do catálogo, sem novo aceite')
    await pressButton(tree, 'Não é duplicada')
    expect(hasField(tree, 'Motivo da recusa (obrigatório)')).toBe(true)
    await pressButton(tree, 'Duplicada: Arena Sul Oficial')
    expect(hasField(tree, 'Motivo da recusa (opcional)')).toBe(true)
    await pressButton(tree, 'Rejeitar sugestão')
    expect(bodyOf('POST', '/admin/court-suggestions/42/decision')).toEqual({ decision: 'rejeitar', duplicate_of_id: 55 })
    expect(toastText()).toContain('Quadra do Lago rejeitada como duplicada de Arena Sul Oficial.')
  })

  it('motivo opcional da duplicada, se informado, tem de 5 a 300 caracteres', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Quadra do Lago.')
    await pressButton(tree, 'Rejeitar')
    await pressButton(tree, 'Duplicada: Arena Sul Oficial')
    await typeInto(tree, 'Motivo da recusa (opcional)', 'ok')
    await pressButton(tree, 'Rejeitar sugestão')
    expect(allText(tree)).toContain('O motivo, se informado, tem de 5 a 300 caracteres.')
    expect(callsTo('POST', '/admin/court-suggestions/42/decision')).toHaveLength(0)
  })

  it('nome repetido no catálogo (409) fica na folha e sugere rejeitar como duplicada', async () => {
    world({ 'POST /admin/court-suggestions/41/decision': new ApiError('Já existe uma quadra publicada com este nome nesta cidade. Rejeite como duplicada.', 409) })
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Publicar')
    await pressButton(tree, 'Publicar quadra')
    expect(allText(tree)).toContain('Já existe uma quadra publicada com este nome nesta cidade. Rejeite como duplicada.')
    expect(findButton(tree, 'Publicar quadra')).toBeTruthy()
  })

  it.each([
    ['já decidida (409)', new ApiError('Esta sugestão já foi decidida.', 409), 'Esta sugestão já foi decidida.'],
    ['não encontrada (404)', new ApiError('Sugestão não encontrada.', 404), 'Sugestão não encontrada.'],
  ])('sugestão %s: a folha fecha, avisa e a fila é relida', async (_name, failure, message) => {
    const state = world({ 'POST /admin/court-suggestions/41/decision': failure })
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Rejeitar')
    await typeInto(tree, 'Motivo da recusa (obrigatório)', 'Duplicada de outra')
    state.open = [state.open[1]]
    await pressButton(tree, 'Rejeitar sugestão')
    expect(toastText()).toContain(message)
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    expect(findButton(tree, 'Rejeitar sugestão')).toBeUndefined()
    expect(callsTo('GET', PENDING)).toHaveLength(2)
    expect(allText(tree)).not.toContain('SGAS 910, Asa Sul')
  })

  it('sessão expirada (401) ao decidir chama onExpired', async () => {
    world({ 'POST /admin/court-suggestions/41/decision': new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    const tree = await mount(expired)
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Publicar')
    await pressButton(tree, 'Publicar quadra')
    expect(expired).toHaveBeenCalled()
  })

  it('paginação por cursor nas duas filas', async () => {
    serve({
      [PENDING]: page([suggestion()], 'c1'), [`${PENDING}&cursor=c1`]: page([suggestion({ court: court({ id: 43, name: 'Quadra Leste' }) })]),
      [DECIDED]: page([]),
    })
    const tree = await mount()
    await pressButton(tree, 'Carregar mais sugestões')
    expect(allText(tree)).toContain('Quadra Leste')
    expect(findButton(tree, 'Carregar mais sugestões')).toBeUndefined()
  })

  it('erro de carregamento oferece "Tentar novamente"', async () => {
    let fail = true
    serve({ [PENDING]: () => (fail ? new ApiError('Fila indisponível.', 500) : page([suggestion()])), [DECIDED]: page([]) })
    const tree = await mount()
    expect(allText(tree)).toContain('Fila indisponível.')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('SGAS 910, Asa Sul')
  })

  it('o botão de publicar fica indisponível enquanto grava e anuncia ocupado', async () => {
    let release!: (value: unknown) => void
    world({ 'POST /admin/court-suggestions/41/decision': () => new Promise(resolve => { release = resolve }) })
    const tree = await mount()
    await pressPrefix(tree, 'Arena Sul.')
    await pressButton(tree, 'Publicar')
    const pending = pressButton(tree, 'Publicar quadra')
    await vi.waitFor(() => expect(isDisabled(tree, 'Publicar quadra')).toBe(true))
    release(suggestion({ court: court({ state: 'publicada', provisional: false }) }))
    await pending
    // A resposta chega depois do toque: espera a tela assentar em vez de depender de um único ciclo (a leitura era instável).
    await vi.waitFor(async () => { await flush(); expect(toastText()).toContain('entrou no catálogo') })
  })
})

describe('W.O. contestados', () => {
  const mount = (onExpired = vi.fn()) => render(h(AdminWalkoverDisputesScreen, { user: admin, onExpired }))
  function world(extra: Record<string, unknown> = {}) {
    const state = { open: [dispute()] }
    serve({
      [DISPUTES]: () => page(state.open),
      [CHAT]: { items: [chatLine(1, { body: 'Chegamos às 19h.' }), chatLine(2, { kind: 'evento', body: 'W.O. registrado por Rafa Nunes.', author: null }), chatLine(3, { removed: true, body: null, author: rafa, side: 'a' })], has_more: true, last_id: 3 },
      'POST /admin/matches/12/walkover-decision': () => {
        state.open = []
        return dispute()
      },
      ...extra,
    })
    return state
  }

  it('lista o W.O. com os nomes dos lados, quem registrou e quem contestou', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Ferrugem FC × Tigres do Lago')
    expect(text).toContain('Society')
    expect(text).toContain('Registrado por Rafa Nunes · contestado por Caio Ramos há 2 horas')
    expect(text).toContain('Aguarda decisão')
  })

  it('fila vazia explica quando aparece algo', async () => {
    serve({ [DISPUTES]: page([]) })
    const tree = await mount()
    expect(allText(tree)).toContain('Nenhum W.O. contestado')
    expect(allText(tree)).toContain('Quando um time contestar um W.O., ele aparece aqui e nas notificações.')
  })

  it('a folha traz os dois relatos, o motivo da contestação e o trecho do chat', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC × Tigres do Lago.')
    const sheet = allText(tree)
    expect(sheet).toContain('W.O. contestado')
    expect(sheet).toContain('Society · #12')
    expect(sheet).toContain('Quadra do Lago')
    expect(sheet).toContain('Tigres do Lago')
    expect(sheet).toContain('Registrou o W.O.')
    expect(sheet).toContain('Rafa Nunes')
    expect(sheet).toMatch(/Ferrugem FC · compareceu · /)
    expect(sheet).toContain('Contestou')
    expect(sheet).toMatch(/Tigres do Lago · lado ausente · /)
    expect(byId(tree, 'walkover-reason').length).toBeGreaterThan(0)
    expect(sheet).toContain('Chegamos às 19h, mas o portão estava fechado.')
    expect(sheet).toContain('Chat da partida')
    expect(sheet).toContain('Chegamos às 19h.')
    expect(sheet).toContain('W.O. registrado por Rafa Nunes.')
    expect(sheet).toContain('Mensagem removida')
    expect(sheet).toContain('Mostrando as últimas 3 mensagens.')
    expect(callsTo('GET', CHAT)).toHaveLength(1)
  })

  it('contestação sem motivo informado e chat vazio ou com falha', async () => {
    const noReason = dispute({ walkover: { ...dispute().walkover, contest_reason: null } })
    serve({ [DISPUTES]: page([noReason]), [CHAT]: { items: [], has_more: false, last_id: null } })
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC × Tigres do Lago.')
    expect(allText(tree)).toContain('Sem motivo informado.')
    expect(allText(tree)).toContain('Nenhuma mensagem no chat.')
    let fail = true
    serve({ [DISPUTES]: page([noReason]), [CHAT]: () => (fail ? new ApiError('Chat indisponível.', 500) : { items: [chatLine(1)], has_more: false, last_id: 1 }) })
    const second = await mount()
    await pressPrefix(second, 'Ferrugem FC × Tigres do Lago.')
    expect(allText(second)).toContain('Chat indisponível.')
    fail = false
    await pressButton(second, 'Tentar novamente')
    expect(allText(second)).toContain('Estamos chegando.')
  })

  it('manter o W.O. exige a justificativa (5 a 500); o corpo leva a decisão e o aviso diz quem venceu', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC × Tigres do Lago.')
    await pressButton(tree, 'Manter o W.O.')
    expect(allText(tree)).toContain('Vale 3 × 0 para Ferrugem FC: a partida é encerrada e o ranking é recalculado.')
    await pressButton(tree, 'Manter o W.O.')
    expect(allText(tree)).toContain('Descreva a decisão, de 5 a 500 caracteres.')
    expect(callsTo('POST', '/admin/matches/12/walkover-decision')).toHaveLength(0)
    await typeInto(tree, 'Justificativa da decisão (os dois lados veem)', '  Registro do árbitro confere  ')
    await pressButton(tree, 'Manter o W.O.')
    expect(bodyOf('POST', '/admin/matches/12/walkover-decision')).toEqual({ decision: 'manter', reason: 'Registro do árbitro confere' })
    expect(toastText()).toContain('W.O. mantido: vitória de Ferrugem FC por 3 × 0.')
    expect(allText(tree)).not.toContain('Registrado por Rafa Nunes')
    expect(allText(tree)).toContain('Nenhum W.O. contestado')
  })

  it('anular deixa a partida sem resultado; "Voltar" desfaz a escolha', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC × Tigres do Lago.')
    await pressButton(tree, 'Anular o W.O.')
    expect(allText(tree)).toContain('A partida fica sem resultado e ninguém pontua.')
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'Manter o W.O.')).toBeTruthy()
    await pressButton(tree, 'Anular o W.O.')
    await typeInto(tree, 'Justificativa da decisão (os dois lados veem)', 'A quadra estava fechada')
    await pressButton(tree, 'Anular o W.O.')
    expect(bodyOf('POST', '/admin/matches/12/walkover-decision')).toEqual({ decision: 'anular', reason: 'A quadra estava fechada' })
    expect(toastText()).toContain('W.O. anulado: Ferrugem FC × Tigres do Lago ficou sem resultado.')
  })

  it('no tênis vale 6-0 6-0 para quem compareceu', async () => {
    const tennis = dispute({
      match: disputeMatch({ sport: 'tenis', format: null, sides: [athleteSide('a', rafa), athleteSide('b', { ...rafa, id: 5, name: 'Bia Rocha' })] }),
      walkover: { ...dispute().walkover, absent_side: 'b' },
    })
    serve({ [DISPUTES]: page([tennis]), [CHAT]: { items: [], has_more: false, last_id: null }, 'POST /admin/matches/12/walkover-decision': tennis })
    const tree = await mount()
    expect(allText(tree)).toContain('Tênis')
    await pressPrefix(tree, 'Rafa Nunes × Bia Rocha.')
    await pressButton(tree, 'Manter o W.O.')
    expect(allText(tree)).toContain('Vale 6-0 6-0 para Rafa Nunes')
  })

  it.each([
    ['já decidido (409)', new ApiError('Este W.O. não aguarda decisão.', 409), 'Este W.O. não aguarda decisão.'],
    ['partida não encontrada (404)', new ApiError('Partida não encontrada.', 404), 'Partida não encontrada.'],
  ])('W.O. %s: a folha fecha, avisa e a fila é relida', async (_name, failure, message) => {
    const state = world({ 'POST /admin/matches/12/walkover-decision': failure })
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC × Tigres do Lago.')
    await pressButton(tree, 'Manter o W.O.')
    await typeInto(tree, 'Justificativa da decisão (os dois lados veem)', 'Vale o registro')
    state.open = []
    await pressButton(tree, 'Manter o W.O.')
    expect(toastText()).toContain(message)
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    expect(findButton(tree, 'Manter o W.O.')).toBeUndefined()
    expect(callsTo('GET', DISPUTES)).toHaveLength(2)
    expect(allText(tree)).toContain('Nenhum W.O. contestado')
  })

  it('outros erros ficam na folha e a decisão pode ser tentada de novo; 401 expira a sessão', async () => {
    world({ 'POST /admin/matches/12/walkover-decision': new ApiError('Descreva a decisão.', 422) })
    const expired = vi.fn()
    const tree = await mount(expired)
    await pressPrefix(tree, 'Ferrugem FC × Tigres do Lago.')
    await pressButton(tree, 'Manter o W.O.')
    await typeInto(tree, 'Justificativa da decisão (os dois lados veem)', 'Vale o registro')
    await pressButton(tree, 'Manter o W.O.')
    expect(allText(tree)).toContain('Descreva a decisão.')
    expect(findButton(tree, 'Manter o W.O.')).toBeTruthy()
    world({ 'POST /admin/matches/12/walkover-decision': new ApiError('Sessão expirada', 401) })
    await pressButton(tree, 'Manter o W.O.')
    expect(expired).toHaveBeenCalled()
  })

  it('paginação por cursor', async () => {
    serve({
      [DISPUTES]: page([dispute()], 'c1'),
      [`${DISPUTES}?cursor=c1`]: page([dispute({ match: disputeMatch({ id: 13, sides: [ferrugem, team('b', 'Leões do Cerrado', 30)] }) })]),
    })
    const tree = await mount()
    await pressButton(tree, 'Carregar mais W.O.')
    expect(allText(tree)).toContain('Ferrugem FC × Leões do Cerrado')
    expect(findButton(tree, 'Carregar mais W.O.')).toBeUndefined()
  })
})
