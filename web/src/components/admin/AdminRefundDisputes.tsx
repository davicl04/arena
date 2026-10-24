import { useCallback, useState } from 'react'
import { CircleCheck, RotateCcw, Scale } from 'lucide-react'
import { decideRefund, REFUND_DISPUTES_PATH, REFUND_REASON_MESSAGE, reasonError } from '@/api/admin'
import type { RefundDecision, RefundDispute } from '@/api/admin'
import { getEntryReceipts, receiptRefusalText, subjectName } from '@/api/receipts'
import type { Receipt } from '@/api/events'
import { ReceiptLink, ReceiptPreview } from '@/components/events/ReceiptFile'
import { StateBadge } from '@/components/events/StateBadge'
import { usePagedList } from '@/hooks/usePagedList'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import type { StateTone } from '@/data/arena'
import { formatDeadline, formatPrice } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'
import { AdminEventRow, ReasonPanel } from './AdminEventParts'
import { InfoList } from './OrganizerRequestSheet'
import { ListState } from './AdminOrganizerRequests'

const eyebrow = 'mt-3 text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase'

/** Situação de um envio no histórico da inscrição. */
function receiptState(receipt: Receipt): [string, StateTone] {
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

/** Envios anteriores da inscrição (pagamentos e devoluções), do mais recente ao mais antigo. */
function History({ entryId, currentId, name, onExpired }: { entryId: number; currentId: number | null; name: string; onExpired: () => void }) {
  const load = useCallback(() => getEntryReceipts(entryId), [entryId])
  const history = useResource(load, onExpired, { fallback: 'Não foi possível carregar o histórico.' })
  const items = (history.data?.items ?? []).filter(item => item.id !== currentId).reverse()
  return <section aria-label="Histórico da inscrição">
    <p className={eyebrow}>Histórico</p>
    {history.loading && <p role="status" className="mt-1 text-[11.5px] text-ink-muted">Carregando o histórico…</p>}
    {history.error && <LoadError size="section" title="Não foi possível carregar o histórico" text={history.error} cause={history.errorCause} onRetry={history.reload} />}
    {history.data && !items.length && <p className="mt-1 text-[11.5px] text-ink-muted">Nenhum outro envio.</p>}
    {items.length > 0 && <ol className="mt-1.5 grid gap-1.5">
      {items.map(item => {
        const [label, tone] = receiptState(item)
        return <li key={item.id} className="grid justify-items-start gap-1 rounded-xl border border-solid border-line p-2.5">
          <StateBadge tone={tone} className="max-w-full whitespace-normal">{label}</StateBadge>
          <small className="text-[10.5px] text-ink-muted">Enviado em {formatDeadline(item.created_at)}{item.uploaded_by && ` por ${item.uploaded_by.name}`}</small>
          {item.resolution_reason && <small className="text-[11px] leading-[1.5] wrap-anywhere">Decisão: {item.resolution_reason}</small>}
          <ReceiptLink receipt={item} label={`Ver o envio de ${name} em ${formatDeadline(item.created_at)} (nova aba)`} className="min-h-8">Ver arquivo</ReceiptLink>
        </li>
      })}
    </ol>}
  </section>
}

/**
 * Folha da devolução contestada: o comprovante enviado pelo organizador, o motivo do participante e o histórico.
 * A administração mantém a devolução ("devolvida") ou pede outro comprovante ("pendente"), sempre com o motivo.
 */
function DisputeSheet({ dispute, onClose, onDecided, onExpired }: {
  dispute: RefundDispute; onClose: () => void; onDecided: (dispute: RefundDispute, message: string) => void; onExpired: () => void
}) {
  const { entry, event, organizer } = dispute
  const refund = entry.refund
  const name = subjectName(entry.subject)
  const [decision, setDecision] = useState<RefundDecision | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)

  async function decide() {
    setAttempted(true)
    if (!decision || reasonError(reason, REFUND_REASON_MESSAGE)) return
    const decided = await run(() => decideRefund(entry.id, decision, reason), 'Não foi possível registrar a decisão.')
    if (decided) onDecided(decided, decision === 'devolvida'
      ? `Devolução de ${name} considerada feita.`
      : `${organizer.name} vai enviar outro comprovante para ${name}.`)
  }
  const back = () => { setDecision(null); setAttempted(false); setError('') }

  return <Sheet title="Devolução contestada" description={event.name} onClose={onClose}>
    <InfoList items={[
      ['Participante', name],
      ['Valor', formatPrice(entry.price_cents)],
      ['Organizador', organizer.name],
      ['Contestada', formatDeadline(dispute.contested_at)],
    ]} />
    <p className={eyebrow}>Comprovante da devolução</p>
    {refund
      ? <>
        <ReceiptPreview receipt={refund} title={`Comprovante da devolução enviado por ${organizer.name}`} onExpired={onExpired} />
        <small className="mt-1 text-[10.5px] text-ink-muted">Enviado em {formatDeadline(refund.created_at)}</small>
      </>
      : <p className="mt-1 text-[11.5px] text-ink-muted">Comprovante indisponível.</p>}
    <p className={eyebrow}>Motivo do participante</p>
    <blockquote className="mt-1 rounded-xl border-l-4 border-solid border-danger bg-[#fff0f2] noite:bg-error-bg px-3 py-2.5 text-[12px] leading-[1.5] whitespace-pre-line wrap-anywhere">
      {refund?.contest_reason ?? 'Sem motivo informado.'}
    </blockquote>
    <History entryId={entry.id} currentId={refund?.id ?? null} name={name} onExpired={onExpired} />

    {!decision && <SheetActions>
      <Button disabled={busy} onClick={() => { setDecision('devolvida'); setError('') }}><CircleCheck size={17} aria-hidden="true" />Devolução feita</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setDecision('pendente'); setError('') }}><RotateCcw size={17} aria-hidden="true" />Pedir outro</Button>
    </SheetActions>}
    {decision && <ReasonPanel tone={decision === 'devolvida' ? 'brand' : 'danger'}
      title={decision === 'devolvida' ? 'Considerar a devolução feita' : 'Pedir outro comprovante'}
      textLabel="Motivo da decisão (o organizador e o participante veem)" text={reason} onText={setReason}
      error={attempted ? reasonError(reason, REFUND_REASON_MESSAGE) : null}
      note={decision === 'devolvida'
        ? 'A inscrição fica como devolvida e o caso é encerrado.'
        : 'A inscrição volta para "Devolução pendente" e o organizador envia outro comprovante.'}
      confirmLabel="Registrar decisão" busyLabel="Registrando…" busy={busy} onConfirm={() => void decide()} onCancel={back} />}
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
  </Sheet>
}

/** Fila "Devoluções contestadas": a contestação mais antiga primeiro; a administração decide cada uma. */
export default function AdminRefundDisputes({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<RefundDispute>(REFUND_DISPUTES_PATH, onExpired)
  const [open, setOpen] = useState<RefundDispute | null>(null)
  return <section aria-label="Devoluções contestadas">
    <p className="mb-3 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted"><Scale size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      O participante disse que a devolução não chegou. Confira o comprovante e o motivo; o Arena não movimenta dinheiro.</p>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle="Nenhuma devolução contestada" emptyText="Quando um participante contestar uma devolução, ela aparece aqui e nas notificações." />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label="Devoluções para decidir">
      {list.items.map(item => <AdminEventRow key={item.entry.id} event={{ name: subjectName(item.entry.subject), starts_at: item.event.starts_at }}
        onOpen={() => setOpen(item)}
        text={`${item.event.name} · ${formatPrice(item.entry.price_cents)} · contestada ${relativeTime(item.contested_at)}`} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais devoluções</Button>}
    {open && <DisputeSheet dispute={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.entry.id !== decided.entry.id))
        setOpen(null)
        toast.success(message)
      }} />}
  </section>
}
