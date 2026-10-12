import type { OrganizerEntry, Receipt } from '../../api/events'
import { receiptRefusalText } from '../../api/receipts'
import type { ReceiptsEvent } from '../../api/receipts'
import type { StateTone } from '../../data/arena'
import { formatDeadline, formatPrice, plural } from '../../utils/format'
import { relativeTime } from '../../utils/relativeTime'

/** Linha da placa do A2: o que falta nos comprovantes ou, no evento cancelado, nas devoluções. */
export function receiptSummary(event: ReceiptsEvent): string {
  const { pending } = event
  if (event.state === 'cancelado') {
    const parts = [
      pending.refunds_to_send && plural(pending.refunds_to_send, 'devolução para enviar', 'devoluções para enviar'),
      pending.refunds_awaiting && plural(pending.refunds_awaiting, 'aguardando o participante', 'aguardando os participantes'),
      pending.refund_disputes && plural(pending.refund_disputes, 'contestada', 'contestadas'),
    ].filter(Boolean)
    return ['Evento cancelado', ...parts].join(' · ')
  }
  const head = pending.receipts ? plural(pending.receipts, 'comprovante para analisar', 'comprovantes para analisar') : 'Nada para analisar'
  const deadline = formatDeadline(event.registration_deadline)
  return deadline ? `${head} · inscrições até ${deadline}` : head
}

export type RefundStep = 'enviar' | 'reenviar' | 'aguardando' | 'contestada' | 'confirmada' | 'recebida' | 'decidida'

export interface RefundStatus {
  step: RefundStep
  label: string
  tone: StateTone
  text: string
  /** O organizador pode anexar (primeiro envio ou outro comprovante pedido pela administração). */
  canAttach: boolean
}

/**
 * Situação da devolução de uma inscrição (seção 16 do contrato): enviar, aguardando o participante (7 dias),
 * contestada (decide a administração), confirmada, recebida sem resposta ou decidida pela administração.
 */
export function refundStatus(entry: OrganizerEntry): RefundStatus {
  const refund = entry.refund
  const value = formatPrice(entry.price_cents)
  if (entry.state === 'devolucao_contestada') {
    return { step: 'contestada', label: 'Contestada', tone: 'danger', canAttach: false,
      text: `Contestada${refund?.responded_at ? ` ${relativeTime(refund.responded_at)}` : ''}: “${refund?.contest_reason ?? 'sem motivo informado'}”. A administração decide.` }
  }
  if (entry.state === 'devolvida') {
    if (refund?.resolution === 'devolvida') {
      return { step: 'decidida', label: 'Decidida', tone: 'open', canAttach: false,
        text: `A administração considerou a devolução feita${refund.resolution_reason ? `: ${refund.resolution_reason}` : '.'}` }
    }
    if (refund?.participant_response === 'automatica') {
      return { step: 'recebida', label: 'Recebida', tone: 'closed', canAttach: false, text: 'Considerada recebida após 7 dias sem resposta.' }
    }
    return { step: 'confirmada', label: 'Confirmada', tone: 'open', canAttach: false,
      text: `Confirmada pelo participante${refund?.responded_at ? ` ${relativeTime(refund.responded_at)}` : ''}.` }
  }
  if (!refund) {
    return { step: 'enviar', label: 'Enviar devolução', tone: 'pending', canAttach: true,
      text: `Faça o Pix de ${value} para o participante e anexe o comprovante.` }
  }
  if (refund.resolution === 'pendente') {
    return { step: 'reenviar', label: 'Outro comprovante', tone: 'danger', canAttach: true,
      text: `A administração pediu outro comprovante${refund.resolution_reason ? `: ${refund.resolution_reason}` : '.'}` }
  }
  return { step: 'aguardando', label: 'Aguardando o participante', tone: 'pending', canAttach: false,
    text: `Enviada ${relativeTime(refund.created_at)}.${refund.auto_confirm_at ? ` Sem resposta até ${formatDeadline(refund.auto_confirm_at)}, conta como recebida.` : ''}` }
}

/** Situação de um envio no histórico da inscrição. */
export function receiptState(receipt: Receipt): [string, StateTone] {
  if (receipt.kind === 'pagamento') {
    if (receipt.decision === 'aprovado') return ['Pagamento aprovado', 'open']
    if (receipt.decision === 'recusado') return [`Pagamento recusado: ${receiptRefusalText(receipt.reason_code, receipt.reason_detail)}`, 'danger']
    return ['Pagamento em análise', 'pending']
  }
  if (receipt.resolution === 'devolvida') return ['Devolução mantida pela administração', 'open']
  if (receipt.resolution === 'pendente') return ['Devolução refeita a pedido da administração', 'danger']
  if (receipt.participant_response === 'contestada') return ['Devolução contestada', 'danger']
  if (receipt.participant_response === 'confirmada') return ['Devolução confirmada', 'open']
  if (receipt.participant_response === 'automatica') return ['Devolução recebida sem resposta', 'closed']
  return ['Devolução aguardando o participante', 'pending']
}
