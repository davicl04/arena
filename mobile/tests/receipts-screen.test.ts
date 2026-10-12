import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { OrganizerEventDetail, ReceiptReview } from '../src/api/events'
import { PDF_NOTICE } from '../src/components/arena/ReceiptImage'
import ReceiptsScreen from '../src/screens/ReceiptsScreen'
import { formatPrice } from '../src/utils/format'
import { enableAct } from './support/native'
import type { Call } from './support/review'
import { playContext } from './support/play'
import {
  allText, bodyOf, byId, callsTo, entry, eventDetail, findButton, hasField, inHours, me, navigationMock, page, person, pressButton, pressPrefix, receipt, render, review, serve, typeInto,
} from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
/** O `Intl` separa "R$" do valor com espaço inseparável: o teste usa o mesmo formato do app. */
const brl = (cents: number) => formatPrice(cents)
const EVENT = '/organizer/events/5'
const QUEUE = `${EVENT}/receipts?tab=para_analisar`
const DECIDED = `${EVENT}/receipts?tab=decididos`

const realGuara = { id: 4, name: 'Real Guará', initials: 'RG', crest_url: null }
const refusedBefore = receipt({ id: 60, created_at: inHours(-30), decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40', decided_at: inHours(-28) })
const first = review()
const second = review({
  receipt: receipt({ id: 71, file_type: 'pdf', file_url: '/api/v1/receipts/71/file', created_at: inHours(-26) }),
  entry: entry({ id: 12, subject: { kind: 'time', team: realGuara, athlete: null } }), attempt: 2, previous: [refusedBefore],
})

interface World { event: OrganizerEventDetail; pending: ReceiptReview[]; decided: ReceiptReview[] }
/** Servidor simulado do A2: aprovar e recusar tiram o comprovante da fila e baixam o contador do evento. */
function world(initial: Partial<World> = {}, extra: Record<string, unknown> = {}): World {
  const state: World = { event: eventDetail(), pending: [first, second], decided: [], ...initial }
  const leave = (id: number) => {
    state.pending = state.pending.filter(item => item.receipt.id !== id)
    state.event = { ...state.event, pending: { ...state.event.pending, receipts: state.pending.length, total: state.pending.length } }
  }
  serve({
    [EVENT]: () => state.event,
    [QUEUE]: () => page(state.pending),
    [DECIDED]: () => page(state.decided),
    'POST /receipts/70/decision': ({ body }: Call) => {
      leave(70)
      return { ...first, receipt: { ...first.receipt, decision: (body as { decision: string }).decision === 'aprovar' ? 'aprovado' : 'recusado' } }
    },
    ...extra,
  })
  return state
}
const navigation = navigationMock()
const mount = (params = { eventId: 5 }, onExpired = vi.fn()) =>
  render(h(ReceiptsScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Comprovantes' }))

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

describe('Comprovantes (A2): fila Para analisar', () => {
  it('lista os envios com miniatura, tentativa e o resumo da placa', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Copa Sudoeste')
    // A placa tem a própria barra (o shell não desenha o cabeçalho): título e volta para o evento.
    expect(text).toContain('Comprovantes')
    await pressButton(tree, 'Voltar para o evento')
    expect(navigation.back).toHaveBeenCalledOnce()
    expect(text).toContain('2 comprovantes para analisar · inscrições até')
    expect(findButton(tree, 'Para analisar (2)')).toBeTruthy()
    expect(findButton(tree, 'Decididos')).toBeTruthy()
    expect(text).toContain('Ferrugem FC')
    expect(text).toContain('Real Guará')
    expect(text).toContain('2ª tentativa')
    expect(text).toContain(brl(24000))
    // Imagem pela rota autorizada (com o Bearer) e PDF com ícone.
    expect(byId(tree, 'receipt-image')).toHaveLength(1)
    expect(byId(tree, 'receipt-pdf-thumb')).toHaveLength(1)
    const image = tree.root.findAllByType('Image' as never)[0]
    expect(image.props.source).toEqual({ uri: 'http://10.0.2.2:8000/api/v1/receipts/70/file', headers: { Authorization: 'Bearer test-token' } })
    expect(callsTo('GET', QUEUE)).toHaveLength(1)
  })

  it('mostra o estado vazio quando não há nada para analisar', async () => {
    world({ pending: [], event: eventDetail({ pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 } }) })
    const tree = await mount()
    expect(allText(tree)).toContain('Nada para analisar')
    expect(allText(tree)).toContain('Quando alguém enviar o comprovante, ele aparece aqui e nas suas notificações.')
    expect(findButton(tree, 'Para analisar')).toBeTruthy()
  })

  it('abre a folha com o valor esperado e aprova: sai da fila, avisa e atualiza o contador', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC:')
    const sheet = allText(tree)
    expect(sheet).toContain('Esperado')
    expect(sheet).toContain(brl(24000))
    expect(sheet).toContain('Liga Sul')
    expect(sheet).toContain('Chave (e-mail)')
    expect(sheet).toContain('pagamentos@ligasul.com.br')
    expect(sheet).toContain('por Léo Matos')
    expect(sheet).not.toContain('Recusas anteriores')
    await pressButton(tree, 'Aprovar')
    expect(bodyOf('POST', '/receipts/70/decision')).toEqual({ decision: 'aprovar' })
    const after = allText(tree)
    expect(after).toContain('Inscrição de Ferrugem FC confirmada.')
    expect(after).toContain('Para analisar (1)')
    expect(findButton(tree, 'Aprovar')).toBeUndefined()
    expect(after).not.toContain('Ferrugem FC: enviado')
    expect(callsTo('GET', EVENT)).toHaveLength(2)
  })

  it('recusar exige o motivo e, em "Outro", o detalhe; o corpo leva o motivo', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC:')
    await pressButton(tree, 'Recusar')
    expect(allText(tree)).toContain('O time vê o motivo e pode enviar outro comprovante até')
    // Sem motivo.
    await pressButton(tree, 'Recusar')
    expect(allText(tree)).toContain('Escolha o motivo da recusa.')
    expect(callsTo('POST', '/receipts/70/decision')).toHaveLength(0)
    // "Outro" sem detalhe.
    await pressButton(tree, 'Outro')
    expect(hasField(tree, 'Detalhe para o time (obrigatório)')).toBe(true)
    await pressButton(tree, 'Recusar')
    expect(allText(tree)).toContain('Descreva o motivo da recusa.')
    expect(callsTo('POST', '/receipts/70/decision')).toHaveLength(0)
    // Com o detalhe.
    await typeInto(tree, 'Detalhe para o time (obrigatório)', '  Foto cortada  ')
    await pressButton(tree, 'Recusar')
    expect(bodyOf('POST', '/receipts/70/decision')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Foto cortada' })
    expect(allText(tree)).toContain('Comprovante de Ferrugem FC recusado.')
    expect(findButton(tree, 'Recusar')).toBeUndefined()
  })

  it('recusar com um motivo da lista dispensa o detalhe e o omite do corpo', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC:')
    await pressButton(tree, 'Recusar')
    await pressButton(tree, 'Valor diferente')
    expect(hasField(tree, 'Detalhe para o time (opcional)')).toBe(true)
    await pressButton(tree, 'Recusar')
    expect(bodyOf('POST', '/receipts/70/decision')).toEqual({ decision: 'recusar', reason_code: 'valor_diferente' })
  })

  it('Voltar fecha o painel do motivo sem enviar nada', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Ferrugem FC:')
    await pressButton(tree, 'Recusar')
    await pressButton(tree, 'Valor diferente')
    await pressButton(tree, 'Voltar')
    expect(findButton(tree, 'Aprovar')).toBeTruthy()
    expect(allText(tree)).not.toContain('Motivo da recusa')
    expect(callsTo('POST', '/receipts/70/decision')).toHaveLength(0)
  })

  it('mostra o histórico de recusas e o aviso do PDF, e avisa que a vaga é liberada após a reserva', async () => {
    world({ pending: [{ ...second, entry: { ...second.entry, reserved_until: inHours(-1) } }] })
    const tree = await mount()
    await pressPrefix(tree, 'Real Guará:')
    const text = allText(tree)
    expect(text).toContain('Recusas anteriores')
    expect(text).toContain('Recusado em')
    expect(text).toContain('Valor diferente · faltaram R$ 40')
    expect(text).toContain('Enviado ontem · PDF · 2ª tentativa')
    expect(byId(tree, 'receipt-pdf-notice')).toHaveLength(1)
    expect(text).toContain(PDF_NOTICE)
    await pressButton(tree, 'Recusar')
    expect(allText(tree)).toContain('A reserva já terminou: ao recusar, a vaga é liberada.')
  })

  it('na revogação pendente a análise fica em espera: faixa e nenhum botão de decisão', async () => {
    world({ event: eventDetail({ revocation_pending: true, revocation_decision: 'pendente' }) })
    const tree = await mount()
    expect(allText(tree)).toContain('A administração está decidindo se o evento segue. A análise dos comprovantes fica em espera; as devoluções continuam.')
    await pressPrefix(tree, 'Ferrugem FC:')
    expect(allText(tree)).toContain('A análise fica em espera até a decisão.')
    expect(findButton(tree, 'Aprovar')).toBeUndefined()
    expect(findButton(tree, 'Recusar')).toBeUndefined()
  })

  it('erro do servidor na decisão fica na folha, e o 401 volta ao login', async () => {
    const expired = vi.fn()
    world({}, { 'POST /receipts/70/decision': new ApiError('Este comprovante já foi decidido.', 409) })
    const tree = await mount({ eventId: 5 }, expired)
    await pressPrefix(tree, 'Ferrugem FC:')
    await pressButton(tree, 'Aprovar')
    expect(allText(tree)).toContain('Este comprovante já foi decidido.')
    expect(findButton(tree, 'Aprovar')).toBeTruthy()
    expect(expired).not.toHaveBeenCalled()
    world({}, { 'POST /receipts/70/decision': new ApiError('Sessão expirada.', 401) })
    const again = await mount({ eventId: 5 }, expired)
    await pressPrefix(again, 'Ferrugem FC:')
    await pressButton(again, 'Aprovar')
    expect(expired).toHaveBeenCalled()
  })

  it('carrega mais comprovantes pelo cursor da API', async () => {
    world({}, { [QUEUE]: () => page([first], 'c2'), [`${QUEUE}&cursor=c2`]: page([second]) })
    const tree = await mount()
    expect(allText(tree)).not.toContain('Real Guará')
    await pressButton(tree, 'Carregar mais comprovantes')
    expect(callsTo('GET', `${QUEUE}&cursor=c2`)).toHaveLength(1)
    expect(allText(tree)).toContain('Real Guará')
    expect(findButton(tree, 'Carregar mais comprovantes')).toBeUndefined()
  })

  it('falha ao carregar o evento oferece tentar de novo', async () => {
    serve({ [EVENT]: new ApiError('Evento não encontrado.', 404) })
    const tree = await mount()
    expect(allText(tree)).toContain('Evento não encontrado.')
    world()
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Copa Sudoeste')
    expect(allText(tree)).toContain('Ferrugem FC')
  })
})

describe('Comprovantes (A2): fila Decididos', () => {
  const approved = review({ receipt: receipt({ id: 72, decision: 'aprovado', decided_at: inHours(-2) }) })
  const refused = review({
    receipt: receipt({ id: 73, decision: 'recusado', reason_code: 'comprovante_ilegivel', decided_at: inHours(-5) }),
    entry: entry({ id: 13, subject: { kind: 'atleta', team: null, athlete: person(8, 'Marina Costa') }, state: 'rejeitada' }),
  })

  it('lista aprovados e recusados com selo e mostra a decisão na folha, sem ações', async () => {
    world({ decided: [approved, refused] })
    const tree = await mount()
    await pressButton(tree, 'Decididos')
    expect(callsTo('GET', DECIDED)).toHaveLength(1)
    const text = allText(tree)
    expect(text).toContain('Aprovado')
    expect(text).toContain('Recusado')
    expect(text).toContain('Decidido há 2 horas')
    expect(findButton(tree, 'Decididos')?.props.accessibilityState).toEqual({ selected: true })
    await pressPrefix(tree, 'Marina Costa:')
    expect(allText(tree)).toContain('Motivo: Comprovante ilegível')
    expect(byId(tree, 'receipt-decision')).toHaveLength(1)
    expect(findButton(tree, 'Aprovar')).toBeUndefined()
    expect(findButton(tree, 'Recusar')).toBeUndefined()
  })

  it('sem decisões mostra o estado vazio', async () => {
    world()
    const tree = await mount()
    await pressButton(tree, 'Decididos')
    expect(allText(tree)).toContain('Nenhum comprovante decidido')
    expect(allText(tree)).toContain('Os comprovantes aprovados ou recusados aparecem aqui.')
  })
})
