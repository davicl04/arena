import { describe, expect, it, vi } from 'vitest'
import { receiptState, receiptSummary, refundStatus } from '../src/components/receipts/receiptView'
import { formatPrice } from '../src/utils/format'
import { entry, eventDetail, inDays, inHours, receipt } from './support/review'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const none = { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 }
const refundOf = (extra: Parameters<typeof receipt>[0] = {}) => receipt({ id: 91, kind: 'devolucao', created_at: inHours(-2), ...extra })

describe('receiptSummary: a linha da placa do A2', () => {
  it('fala dos comprovantes e do fim das inscrições', () => {
    expect(receiptSummary(eventDetail({ registration_deadline: null, pending: { ...none, receipts: 1 } }))).toBe('1 comprovante para analisar')
    expect(receiptSummary(eventDetail({ registration_deadline: null, pending: none }))).toBe('Nada para analisar')
    expect(receiptSummary(eventDetail({ registration_deadline: inDays(2), pending: { ...none, receipts: 3 } }))).toMatch(/^3 comprovantes para analisar · inscrições até .+/)
  })

  it('no evento cancelado, lista só o que há de devolução', () => {
    const cancelled = (pending: typeof none) => receiptSummary(eventDetail({ state: 'cancelado', pending }))
    expect(cancelled(none)).toBe('Evento cancelado')
    expect(cancelled({ ...none, refunds_to_send: 1, refunds_awaiting: 2, refund_disputes: 1 })).toBe('Evento cancelado · 1 devolução para enviar · 2 aguardando os participantes · 1 contestada')
    expect(cancelled({ ...none, refunds_awaiting: 1, refund_disputes: 3 })).toBe('Evento cancelado · 1 aguardando o participante · 3 contestadas')
  })
})

describe('refundStatus: a situação da devolução de uma inscrição', () => {
  const price = formatPrice(24000)
  it('sem comprovante enviado, o organizador envia', () => {
    expect(refundStatus(entry({ state: 'devolucao_pendente', refund: null }))).toEqual({
      step: 'enviar', label: 'Enviar devolução', tone: 'pending', canAttach: true, text: `Faça o Pix de ${price} para o participante e anexe o comprovante.`,
    })
  })

  it('enviada, aguarda o participante até o prazo; a administração pode pedir outro', () => {
    const waiting = refundStatus(entry({ state: 'devolucao_pendente', refund: refundOf({ auto_confirm_at: null }) }))
    expect(waiting).toMatchObject({ step: 'aguardando', canAttach: false, text: 'Enviada há 2 horas.' })
    expect(refundStatus(entry({ state: 'devolucao_pendente', refund: refundOf({ resolution: 'pendente', resolution_reason: null }) })))
      .toMatchObject({ step: 'reenviar', canAttach: true, text: 'A administração pediu outro comprovante.' })
  })

  it('contestada, confirmada, recebida sem resposta e decidida pela administração', () => {
    expect(refundStatus(entry({ state: 'devolucao_contestada', refund: null })).text).toBe('Contestada: “sem motivo informado”. A administração decide.')
    expect(refundStatus(entry({ state: 'devolucao_contestada', refund: refundOf({ contest_reason: 'Faltou valor', responded_at: inHours(-1) }) })).text).toBe('Contestada há 1 hora: “Faltou valor”. A administração decide.')
    expect(refundStatus(entry({ state: 'devolvida', refund: refundOf({ participant_response: 'confirmada' }) }))).toMatchObject({ step: 'confirmada', tone: 'open', text: 'Confirmada pelo participante.' })
    expect(refundStatus(entry({ state: 'devolvida', refund: refundOf({ participant_response: 'confirmada', responded_at: inHours(-3) }) })).text).toBe('Confirmada pelo participante há 3 horas.')
    expect(refundStatus(entry({ state: 'devolvida', refund: refundOf({ participant_response: 'automatica' }) }))).toMatchObject({ step: 'recebida', tone: 'closed' })
    expect(refundStatus(entry({ state: 'devolvida', refund: refundOf({ resolution: 'devolvida', resolution_reason: null }) })).text).toBe('A administração considerou a devolução feita.')
    expect(refundStatus(entry({ state: 'devolvida', refund: null }))).toMatchObject({ step: 'confirmada' })
  })
})

describe('receiptState: o histórico da inscrição na devolução contestada', () => {
  it('pagamentos', () => {
    expect(receiptState(receipt({ decision: 'aprovado' }))).toEqual(['Pagamento aprovado', 'open'])
    expect(receiptState(receipt({ decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40' }))).toEqual(['Pagamento recusado: Valor diferente · faltaram R$ 40', 'danger'])
    expect(receiptState(receipt())).toEqual(['Pagamento em análise', 'pending'])
  })

  it('devoluções, da resolução da administração à resposta do participante', () => {
    expect(receiptState(refundOf({ resolution: 'devolvida' }))).toEqual(['Devolução mantida pela administração', 'open'])
    expect(receiptState(refundOf({ resolution: 'pendente' }))).toEqual(['Devolução refeita a pedido da administração', 'danger'])
    expect(receiptState(refundOf({ participant_response: 'contestada' }))).toEqual(['Devolução contestada', 'danger'])
    expect(receiptState(refundOf({ participant_response: 'confirmada' }))).toEqual(['Devolução confirmada', 'open'])
    expect(receiptState(refundOf({ participant_response: 'automatica' }))).toEqual(['Devolução recebida sem resposta', 'closed'])
    expect(receiptState(refundOf())).toEqual(['Devolução aguardando o participante', 'pending'])
  })
})
