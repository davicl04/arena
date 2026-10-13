import { useId, useRef } from 'react'
import { Paperclip, Undo2 } from 'lucide-react'
import { eventEntriesPath } from '@/api/events'
import type { OrganizerEntry } from '@/api/events'
import { RECEIPT_ACCEPT, receiptFileError, sendRefundReceipt, subjectName } from '@/api/receipts'
import { ReceiptLink, ReceiptThumb } from '@/components/events/ReceiptFile'
import { StateBadge } from '@/components/events/StateBadge'
import { usePagedList } from '@/hooks/usePagedList'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import type { EntryState, StateTone } from '@/data/arena'
import { formatDeadline, formatPrice } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'

type RefundStep = 'enviar' | 'reenviar' | 'aguardando' | 'contestada' | 'confirmada' | 'recebida' | 'decidida'

interface RefundStatus {
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
function refundStatus(entry: OrganizerEntry): RefundStatus {
  const refund = entry.refund
  const value = formatPrice(entry.price_cents)
  if (entry.state === 'devolucao_contestada')
    return { step: 'contestada', label: 'Contestada', tone: 'danger', canAttach: false,
      text: `Contestada${refund?.responded_at ? ` ${relativeTime(refund.responded_at)}` : ''}: “${refund?.contest_reason ?? 'sem motivo informado'}”. A administração decide.` }
  if (entry.state === 'devolvida') {
    if (refund?.resolution === 'devolvida')
      return { step: 'decidida', label: 'Decidida', tone: 'open', canAttach: false,
        text: `A administração considerou a devolução feita${refund.resolution_reason ? `: ${refund.resolution_reason}` : '.'}` }
    if (refund?.participant_response === 'automatica')
      return { step: 'recebida', label: 'Recebida', tone: 'closed', canAttach: false, text: 'Considerada recebida após 7 dias sem resposta.' }
    return { step: 'confirmada', label: 'Confirmada', tone: 'open', canAttach: false,
      text: `Confirmada pelo participante${refund?.responded_at ? ` ${relativeTime(refund.responded_at)}` : ''}.` }
  }
  if (!refund)
    return { step: 'enviar', label: 'Enviar devolução', tone: 'pending', canAttach: true,
      text: `Faça o Pix de ${value} para o participante e anexe o comprovante.` }
  if (refund.resolution === 'pendente')
    return { step: 'reenviar', label: 'Outro comprovante', tone: 'danger', canAttach: true,
      text: `A administração pediu outro comprovante${refund.resolution_reason ? `: ${refund.resolution_reason}` : '.'}` }
  return { step: 'aguardando', label: 'Aguardando o participante', tone: 'pending', canAttach: false,
    text: `Enviada ${relativeTime(refund.created_at)}.${refund.auto_confirm_at ? ` Sem resposta até ${formatDeadline(refund.auto_confirm_at)}, conta como recebida.` : ''}` }
}

/** Uma inscrição com devolução: situação, arquivo enviado e "Anexar comprovante" (imagem ou PDF até 5 MiB). */
function RefundRow({ entry, onSent, onExpired }: { entry: OrganizerEntry; onSent: (entry: OrganizerEntry) => void; onExpired: () => void }) {
  const id = useId()
  const picker = useRef<HTMLInputElement>(null)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const name = subjectName(entry.subject)
  const status = refundStatus(entry)
  const refund = entry.refund

  async function attach(file: File | undefined) {
    if (!file) return
    const problem = receiptFileError(file)
    if (problem) { setError(problem); return }
    const sent = await run(() => sendRefundReceipt(entry.id, file), 'Não foi possível enviar o comprovante da devolução.')
    if (sent) onSent(sent)
  }

  return <li className="rounded-card bg-white p-3 shadow-[0_2px_8px_#0000000a]" aria-labelledby={`${id}-name`}>
    <div className="flex items-start gap-3">
      {refund && status.step !== 'enviar'
        ? <ReceiptThumb receipt={refund} name={name} onExpired={onExpired} />
        : <span className="grid h-[60px] w-12 flex-none place-items-center rounded-[10px] border border-dashed border-line-strong text-ink-muted"><Undo2 size={18} aria-hidden="true" /></span>}
      <div className="grid min-w-0 flex-1 justify-items-start gap-1">
        <b id={`${id}-name`} className="max-w-full text-[13px] wrap-anywhere">{name}</b>
        <small className="text-[10.5px] text-ink-muted">{formatPrice(entry.price_cents)} {entry.state === 'devolvida' ? 'devolvidos' : 'a devolver'}</small>
        <StateBadge tone={status.tone}>{status.label}</StateBadge>
      </div>
    </div>
    <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-muted wrap-anywhere">{status.text}</p>
    {(status.canAttach || (refund && status.step !== 'enviar')) && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {status.canAttach && <>
        <input ref={picker} className="sr-only" type="file" accept={RECEIPT_ACCEPT} tabIndex={-1} aria-hidden="true"
          data-entry={entry.id} onChange={event => { void attach(event.target.files?.[0]); event.target.value = '' }} />
        <Button size="compact" disabled={busy} aria-describedby={`${id}-hint`} onClick={() => picker.current?.click()}>
          <Paperclip size={15} aria-hidden="true" />{busy ? 'Enviando…' : status.step === 'reenviar' ? 'Anexar outro comprovante' : 'Anexar comprovante'}
        </Button>
        <small id={`${id}-hint`} className="text-[10px] text-ink-muted">Imagem ou PDF, até 5 MiB</small>
      </>}
      {refund && status.step !== 'enviar' && <ReceiptLink receipt={refund} label={`Ver o comprovante da devolução de ${name} (nova aba)`}>
        Ver comprovante enviado
      </ReceiptLink>}
    </div>}
    <div aria-live="polite">{error && <p className={feedbackVariants({ className: 'mb-0' })} role="alert">{error}</p>}</div>
  </li>
}

const groups: { state: EntryState; title: string; empty: string }[] = [
  { state: 'devolucao_pendente', title: 'Para enviar e aguardando', empty: 'Nenhuma devolução pendente.' },
  { state: 'devolucao_contestada', title: 'Contestadas', empty: 'Nenhuma devolução contestada.' },
  { state: 'devolvida', title: 'Concluídas', empty: 'Nenhuma devolução concluída ainda.' },
]

function RefundGroup({ eventId, state, title, empty, onSent, onExpired }: {
  eventId: number; state: EntryState; title: string; empty: string; onSent: (entry: OrganizerEntry) => void; onExpired: () => void
}) {
  const list = usePagedList<OrganizerEntry>(eventEntriesPath(eventId, state), onExpired)
  return <section aria-label={title} className="mt-4">
    <h2 className="mx-1 mb-2 text-[10px] font-bold tracking-[0.1em] text-ink-muted uppercase">{title}</h2>
    {list.loading && <p role="status" className="py-2 text-[12px]">Carregando…</p>}
    {list.error && <div className={feedbackVariants()} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>}
    {!list.loading && !list.error && !list.items.length && <p className="mx-1 text-[11.5px] text-ink-muted">{empty}</p>}
    {list.items.length > 0 && <ul className="grid gap-2">
      {list.items.map(entry => <RefundRow key={entry.id} entry={entry} onExpired={onExpired}
        onSent={sent => { list.setItems(old => old.map(item => item.id === sent.id ? sent : item)); onSent(sent) }} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-3 w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais</Button>}
  </section>
}

/**
 * Devoluções do evento cancelado: o organizador devolve por Pix, fora do Arena, e anexa o comprovante de cada
 * inscrição; o participante confirma ou contesta (sem resposta em 7 dias, conta como recebida).
 */
export function RefundList({ eventId, onSent, onExpired }: { eventId: number; onSent: (entry: OrganizerEntry) => void; onExpired: () => void }) {
  return <div>
    <p className="mt-1 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted">
      Devolva o valor de cada inscrição paga por Pix, fora do Arena, e anexe o comprovante. O participante confirma o recebimento; sem resposta em 7 dias, conta como recebida.
    </p>
    {groups.map(group => <RefundGroup key={group.state} eventId={eventId} {...group} onSent={onSent} onExpired={onExpired} />)}
  </div>
}
