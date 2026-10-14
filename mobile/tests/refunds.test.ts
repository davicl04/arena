import React from 'react'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { OrganizerEntry, OrganizerEventDetail } from '../src/api/events'
import ReceiptsScreen from '../src/screens/ReceiptsScreen'
import { formatPrice } from '../src/utils/format'
import { enableAct } from './support/native'
import { playContext } from './support/play'
import {
  allText, byId, callsTo, entry, eventDetail, findButton, inDays, inHours, isDisabled, labelled, me, navigationMock, page, person, pressButton, receipt, render, serve,
} from './support/review'
import { toastText } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const brl = (cents: number) => formatPrice(cents)
const MIB = 1024 * 1024
const EVENT = '/organizer/events/5'
const entriesPath = (state: string) => `${EVENT}/entries?state=${state}`

const team = (id: number, name: string) => ({ kind: 'time' as const, team: { id, name, initials: name.slice(0, 2).toUpperCase(), crest_url: null }, athlete: null })
const refundFile = (id: number, extra: Parameters<typeof receipt>[0] = {}) =>
  receipt({ id, kind: 'devolucao', file_url: `/api/v1/receipts/${id}/file`, uploaded_by: person(2, 'Rafa Nunes'), created_at: inHours(-2), ...extra })

const toSend = entry({ id: 21, state: 'devolucao_pendente', subject: team(3, 'Ferrugem FC'), refund: null })
const awaiting = entry({ id: 22, state: 'devolucao_pendente', subject: team(4, 'Real Guará'), refund: refundFile(91, { auto_confirm_at: inDays(5) }) })
const again = entry({ id: 23, state: 'devolucao_pendente', subject: team(6, 'Unidos do Cerrado'), refund: refundFile(92, { resolution: 'pendente', resolution_reason: 'O valor não confere', file_type: 'pdf' }) })
const disputed = entry({ id: 24, state: 'devolucao_contestada', subject: team(7, 'Leões da Asa'), refund: refundFile(93, { participant_response: 'contestada', contest_reason: 'Voltou só metade', responded_at: inHours(-1) }) })
const confirmed = entry({ id: 25, state: 'devolvida', subject: team(8, 'Atlético Guará'), refund: refundFile(94, { participant_response: 'confirmada', responded_at: inHours(-3) }) })
const automatic = entry({ id: 26, state: 'devolvida', subject: team(9, 'Vila Planalto'), refund: refundFile(95, { participant_response: 'automatica' }) })
const decided = entry({ id: 27, state: 'devolvida', subject: team(10, 'Sobradinho EC'), refund: refundFile(96, { resolution: 'devolvida', resolution_reason: 'Comprovante confere' }) })

interface World { event: OrganizerEventDetail; pending: OrganizerEntry[]; disputed: OrganizerEntry[]; done: OrganizerEntry[] }
function world(initial: Partial<World> = {}, extra: Record<string, unknown> = {}): World {
  const state: World = {
    event: eventDetail({
      state: 'cancelado', phase: 'cancelado', cancelled_at: inHours(-5), cancel_reason: 'Chuva forte',
      pending: { receipts: 0, refunds_to_send: 2, refunds_awaiting: 1, refund_disputes: 1, total: 2 },
    }),
    pending: [toSend, awaiting, again], disputed: [disputed], done: [confirmed, automatic, decided], ...initial,
  }
  serve({
    [EVENT]: () => state.event,
    [entriesPath('devolucao_pendente')]: () => page(state.pending),
    [entriesPath('devolucao_contestada')]: () => page(state.disputed),
    [entriesPath('devolvida')]: () => page(state.done),
    [`${EVENT}/receipts?tab=decididos`]: () => page([]),
    ...extra,
  })
  return state
}
const mount = (onExpired = vi.fn()) =>
  render(h(ReceiptsScreen, { user: me, navigation: navigationMock(), onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: { eventId: 5 }, title: 'Comprovantes' }))
const pickDocument = (asset: { name: string; mimeType?: string; size?: number }) =>
  vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: `file:///cache/${asset.name}`, lastModified: 0, ...asset }] } as DocumentPicker.DocumentPickerResult)

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(DocumentPicker.getDocumentAsync).mockReset()
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

describe('Evento cancelado: a aba vira Devoluções', () => {
  it('troca a primeira aba, resume a placa e mostra os quatro grupos com a situação de cada devolução', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Evento cancelado · 2 devoluções para enviar · 1 aguardando o participante · 1 contestada')
    expect(findButton(tree, 'Devoluções (2)')).toBeTruthy()
    expect(findButton(tree, 'Para analisar')).toBeUndefined()
    expect(findButton(tree, 'Decididos')).toBeTruthy()
    // Nenhuma leitura da fila de comprovantes de pagamento.
    expect(callsTo('GET', `${EVENT}/receipts?tab=para_analisar`)).toHaveLength(0)
    for (const title of ['Para enviar e aguardando', 'Contestadas', 'Concluídas']) expect(text).toContain(title)

    // Pendentes: enviar, aguardando (prazo de 7 dias) e outro comprovante pedido pela administração.
    expect(text).toContain(`Faça o Pix de ${brl(24000)} para o participante e anexe o comprovante.`)
    expect(text).toContain('Enviar devolução')
    expect(text).toMatch(/Enviada há 2 horas\. Sem resposta até .+, conta como recebida\./)
    expect(text).toContain('Aguardando o participante')
    expect(text).toContain('A administração pediu outro comprovante: O valor não confere')
    expect(text).toContain('Outro comprovante')
    // Contestada: o motivo do participante e a administração decide.
    expect(text).toContain('Contestada há 1 hora: “Voltou só metade”. A administração decide.')
    // Concluídas: confirmada, recebida sem resposta e decidida pela administração.
    expect(text).toContain('Confirmada pelo participante há 3 horas.')
    expect(text).toContain('Considerada recebida após 7 dias sem resposta.')
    expect(text).toContain('A administração considerou a devolução feita: Comprovante confere')
    expect(text).toContain(`${brl(24000)} devolvidos`)
    // Só quem pode anexar tem o botão; a miniatura do PDF aparece no comprovante em PDF.
    expect(findButton(tree, 'Anexar comprovante de Ferrugem FC')).toBeTruthy()
    expect(findButton(tree, 'Anexar outro comprovante de Unidos do Cerrado')).toBeTruthy()
    expect(findButton(tree, 'Anexar comprovante de Real Guará')).toBeUndefined()
    expect(findButton(tree, 'Anexar comprovante de Leões da Asa')).toBeUndefined()
    expect(byId(tree, 'receipt-pdf-thumb')).toHaveLength(1)
  })

  it('grupos vazios mostram a linha de texto de cada um', async () => {
    world({ pending: [], disputed: [], done: [], event: eventDetail({ state: 'cancelado', pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 } }) })
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Nenhuma devolução pendente.')
    expect(text).toContain('Nenhuma devolução contestada.')
    expect(text).toContain('Nenhuma devolução concluída ainda.')
    expect(findButton(tree, 'Devoluções')).toBeTruthy()
  })

  it('as devoluções continuam com a revogação pendente', async () => {
    world({ event: eventDetail({ state: 'cancelado', revocation_pending: true, pending: { receipts: 0, refunds_to_send: 1, refunds_awaiting: 0, refund_disputes: 0, total: 1 } }) })
    const tree = await mount()
    expect(allText(tree)).toContain('as devoluções continuam')
    expect(findButton(tree, 'Anexar comprovante de Ferrugem FC')).toBeTruthy()
  })

  it('a aba Decididos continua disponível no evento cancelado', async () => {
    world()
    const tree = await mount()
    await pressButton(tree, 'Decididos')
    expect(callsTo('GET', `${EVENT}/receipts?tab=decididos`)).toHaveLength(1)
    expect(allText(tree)).toContain('Nenhum comprovante decidido')
    expect(allText(tree)).not.toContain('Para enviar e aguardando')
  })
})

describe('Anexar a devolução', () => {
  it('confere o arquivo no cliente: tamanho, tipo e arquivo vazio, com as mensagens do servidor', async () => {
    world()
    const tree = await mount()
    await pressButton(tree, 'Anexar comprovante de Ferrugem FC')
    expect(allText(tree)).toContain('Anexar devolução')
    expect(allText(tree)).toContain('Imagem (JPEG, PNG ou WebP) ou PDF, até 5 MiB.')
    expect(isDisabled(tree, 'Enviar devolução')).toBe(true)

    pickDocument({ name: 'pix.pdf', mimeType: 'application/pdf', size: 6 * MIB })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(allText(tree)).toContain('O arquivo excede o limite de 5 MiB.')
    expect(isDisabled(tree, 'Enviar devolução')).toBe(true)

    pickDocument({ name: 'planilha.xlsx', mimeType: 'application/vnd.ms-excel', size: 1024 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(allText(tree)).toContain('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    expect(allText(tree)).not.toContain('O arquivo excede o limite de 5 MiB.')

    pickDocument({ name: 'vazio.png', mimeType: 'image/png', size: 0 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(allText(tree)).toContain('O arquivo enviado está vazio.')
    expect(callsTo('PUT', '/entries/21/refund-receipt')).toHaveLength(0)
    expect(vi.mocked(DocumentPicker.getDocumentAsync)).toHaveBeenCalledWith(expect.objectContaining({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], multiple: false }))
  })

  it('envia o PDF escolhido, troca a linha pela devolução enviada e avisa', async () => {
    const sent = entry({ ...toSend, refund: refundFile(97, { file_type: 'pdf', auto_confirm_at: inDays(7) }) })
    const state = world({}, { 'PUT /entries/21/refund-receipt': () => { state.pending = [sent, awaiting, again]; state.event = eventDetail({ ...state.event, pending: { ...state.event.pending, refunds_to_send: 1, refunds_awaiting: 2 } }); return sent } })
    const tree = await mount()
    await pressButton(tree, 'Anexar comprovante de Ferrugem FC')
    pickDocument({ name: 'devolucao.PDF', mimeType: '', size: 120 * 1024 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    // O tipo vem da extensão quando o seletor não informa.
    expect(labelled(tree, 'Arquivo escolhido: devolucao.PDF')).toHaveLength(1)
    expect(allText(tree)).toContain('120 KB · PDF')
    expect(allText(tree)).toContain('Trocar arquivo (imagem ou PDF)')
    await pressButton(tree, 'Enviar devolução')
    const [call] = callsTo('PUT', '/entries/21/refund-receipt')
    expect(call).toBeTruthy()
    expect(call[2]).toBeInstanceOf(FormData)
    const text = allText(tree)
    expect(toastText()).toContain('Devolução de Ferrugem FC enviada. O participante confirma o recebimento.')
    expect(text).toContain('Devoluções (1)')
    expect(findButton(tree, 'Anexar comprovante de Ferrugem FC')).toBeUndefined()
    expect(text).not.toContain('Anexar devolução')
    // A linha agora aguarda o participante.
    expect(text.match(/Aguardando o participante/g)).toHaveLength(2)
  })

  it('a galeria envia a foto com o tipo informado pelo aparelho', async () => {
    const sent = entry({ ...toSend, refund: refundFile(98, { auto_confirm_at: inDays(7) }) })
    world({}, { 'PUT /entries/21/refund-receipt': sent })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///galeria/pix.jpg', fileName: 'pix.jpg', mimeType: 'image/jpeg', fileSize: 300 * 1024, width: 10, height: 10 }] } as ImagePicker.ImagePickerResult)
    const tree = await mount()
    await pressButton(tree, 'Anexar comprovante de Ferrugem FC')
    await pressButton(tree, 'Escolher da galeria')
    expect(vi.mocked(ImagePicker.launchImageLibraryAsync)).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.8 }))
    expect(allText(tree)).toContain('300 KB · Imagem')
    expect(tree.root.findAllByType('Image' as never).some(item => item.props.source?.uri === 'file:///galeria/pix.jpg')).toBe(true)
    await pressButton(tree, 'Enviar devolução')
    expect(callsTo('PUT', '/entries/21/refund-receipt')).toHaveLength(1)
  })

  it('cancelar o seletor não muda nada, e falha ao abri-lo avisa', async () => {
    world()
    const tree = await mount()
    await pressButton(tree, 'Anexar comprovante de Ferrugem FC')
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: true, assets: null } as DocumentPicker.DocumentPickerResult)
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    expect(isDisabled(tree, 'Enviar devolução')).toBe(true)
    expect(allText(tree)).not.toContain('Não foi possível abrir o seletor')
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockRejectedValueOnce(new Error('permissão negada'))
    await pressButton(tree, 'Escolher da galeria')
    expect(allText(tree)).toContain('Não foi possível abrir o seletor de arquivos. Tente de novo.')
  })

  it('erro do servidor fica na folha e o 401 volta ao login', async () => {
    const expired = vi.fn()
    world({}, { 'PUT /entries/21/refund-receipt': new ApiError('A devolução já foi enviada; aguarde a resposta do participante.', 409) })
    const tree = await mount(expired)
    await pressButton(tree, 'Anexar comprovante de Ferrugem FC')
    pickDocument({ name: 'pix.png', mimeType: 'image/png', size: 2048 })
    await pressButton(tree, 'Escolher arquivo (imagem ou PDF)')
    await pressButton(tree, 'Enviar devolução')
    expect(toastText()).toContain('A devolução já foi enviada; aguarde a resposta do participante.')
    expect(allText(tree)).toContain('Anexar devolução')
    expect(expired).not.toHaveBeenCalled()
    world({}, { 'PUT /entries/21/refund-receipt': new ApiError('Sessão expirada.', 401) })
    await pressButton(tree, 'Enviar devolução')
    expect(expired).toHaveBeenCalled()
  })

  it('a administração pediu outro comprovante: a folha é de "outro comprovante"', async () => {
    world()
    const tree = await mount()
    await pressButton(tree, 'Anexar outro comprovante de Unidos do Cerrado')
    expect(allText(tree)).toContain('Anexar outro comprovante')
    expect(allText(tree)).toContain('Unidos do Cerrado')
  })
})
