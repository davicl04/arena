import { useState } from 'react'
import { Ban, Play, ShieldOff } from 'lucide-react'
import { adminEventsPath, CANCEL_REASON_MESSAGE, decideRevocation, reasonError } from '@/api/admin'
import type { AdminEvent } from '@/api/admin'
import { StateBadge } from '@/components/events/StateBadge'
import { usePagedList } from '@/hooks/usePagedList'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { entryStates } from '@/data/arena'
import { plural } from '@/utils/format'
import { AdminEventInfo, AdminEventRow, AdminPoster, ReasonPanel } from './AdminEventParts'
import { ListState } from './AdminOrganizerRequests'

/** O que está em jogo: inscrições por estado e as pendências de comprovantes e devoluções. */
function AtStake({ event }: { event: AdminEvent }) {
  const states = entryStates.filter(state => (event.entries_by_state[state.value] ?? 0) > 0)
  const { pending } = event
  const pendencies = [
    pending.receipts && plural(pending.receipts, 'comprovante para analisar', 'comprovantes para analisar'),
    pending.refunds_to_send && plural(pending.refunds_to_send, 'devolução para enviar', 'devoluções para enviar'),
    pending.refunds_awaiting && plural(pending.refunds_awaiting, 'devolução aguardando', 'devoluções aguardando'),
    pending.refund_disputes && plural(pending.refund_disputes, 'devolução contestada', 'devoluções contestadas'),
  ].filter(Boolean)
  return <section aria-label="Inscrições" className="mt-2.5 rounded-xl border border-solid border-line p-3">
    <p className="text-[12px] font-bold">Inscrições</p>
    {states.length
      ? <ul className="mt-2 flex flex-wrap gap-1.5">
        {states.map(state => <li key={state.value}><StateBadge tone={state.tone}>{event.entries_by_state[state.value]} · {state.label}</StateBadge></li>)}
      </ul>
      : <p className="mt-1 text-[11.5px] text-ink-muted">Nenhuma inscrição ainda.</p>}
    {pendencies.length > 0 && <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-muted">Pendências: {pendencies.join(' · ')}.</p>}
  </section>
}

/**
 * Folha do evento de organizador revogado: a administração decide se o evento segue (o organizador volta a gerir) ou
 * se é cancelado com devolução (motivo obrigatório, o mesmo cancelamento do organizador).
 */
function RevokedEventSheet({ event, onClose, onDecided, onExpired }: {
  event: AdminEvent; onClose: () => void; onDecided: (event: AdminEvent, message: string) => void; onExpired: () => void
}) {
  const [step, setStep] = useState<'escolher' | 'seguir' | 'cancelar'>('escolher')
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const paid = (event.price_cents ?? 0) > 0
  const confirmed = (event.entries_by_state.confirmada ?? 0) + (event.entries_by_state.em_analise ?? 0)

  async function keep() {
    const decided = await run(() => decideRevocation(event.id, { decision: 'seguir' }), 'Não foi possível registrar a decisão.')
    if (decided) onDecided(decided, `${event.name} segue com o organizador.`)
  }
  async function cancel() {
    setAttempted(true)
    if (reasonError(reason, CANCEL_REASON_MESSAGE)) return
    const decided = await run(() => decideRevocation(event.id, { decision: 'cancelar', reason: reason.trim() }), 'Não foi possível cancelar o evento.')
    if (decided) onDecided(decided, `${event.name} foi cancelado. ${paid ? 'O organizador envia as devoluções.' : 'Os inscritos foram avisados.'}`)
  }
  const back = () => { setStep('escolher'); setAttempted(false); setError('') }

  return <Sheet title="Organizador revogado" description={`${event.organizer.display_name} · ${event.organizer.user.name}`} onClose={onClose}>
    <AdminPoster event={event} className="mt-1" />
    <p className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-muted">
      <StateBadge tone="danger">{event.organizer.active ? 'Organizador ativo' : 'Permissão revogada'}</StateBadge>
      Inscrições suspensas até a decisão.
    </p>
    <AdminEventInfo event={event} />
    <AtStake event={event} />

    {step === 'escolher' && <SheetActions>
      <Button disabled={busy} onClick={() => { setStep('seguir'); setError('') }}><Play size={17} aria-hidden="true" />Seguir evento</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setStep('cancelar'); setError('') }}><Ban size={17} aria-hidden="true" />Cancelar evento</Button>
    </SheetActions>}

    {step === 'seguir' && <div className="mt-3 grid gap-2.5 rounded-card p-3.5 shadow-[inset_0_0_0_1.5px_#005a3655]">
      <b className="text-[13px]">Seguir com o evento?</b>
      <p className="text-[11.5px] leading-[1.5] text-ink-muted">O organizador continua gerindo este evento, e as inscrições reabrem se o prazo permitir. A decisão fica registrada e ele é avisado.</p>
      <SheetActions className="mt-0">
        <Button variant="secondary" disabled={busy} onClick={back}>Voltar</Button>
        <Button data-autofocus disabled={busy} onClick={() => void keep()}>{busy ? 'Registrando…' : 'Confirmar'}</Button>
      </SheetActions>
    </div>}

    {step === 'cancelar' && <ReasonPanel title="Cancelar com devolução" textLabel="Motivo do cancelamento (aparece aos inscritos)" text={reason} onText={setReason}
      error={attempted ? reasonError(reason, CANCEL_REASON_MESSAGE) : null}
      note={paid && confirmed
        ? `${plural(confirmed, 'inscrição paga vira', 'inscrições pagas viram')} devolução pendente; o organizador devolve por Pix e anexa os comprovantes.`
        : 'Os inscritos recebem o aviso de cancelamento com o motivo.'}
      confirmLabel="Cancelar evento" busyLabel="Cancelando…" busy={busy} onConfirm={() => void cancel()} onCancel={back} />}
    <div aria-live="polite">{error && <p className={feedbackVariants()} role="alert">{error}</p>}</div>
  </Sheet>
}

/**
 * Fila "Eventos de organizador revogado": eventos publicados ou em andamento de quem perdeu a permissão, pela data de
 * início. Cada um segue com o organizador ou é cancelado com devolução.
 */
export default function AdminRevokedEvents({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<AdminEvent>(adminEventsPath('revogacao'), onExpired)
  const [open, setOpen] = useState<AdminEvent | null>(null)
  const [notice, setNotice] = useState('')
  return <section aria-label="Eventos de organizador revogado">
    <p className="mb-3 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted"><ShieldOff size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      Decida se cada evento segue ou é cancelado. Enquanto isso, as inscrições ficam suspensas e a gestão só lê os dados.</p>
    <div aria-live="polite">{notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}</div>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle="Nada para decidir" emptyText="Quando um organizador com eventos abertos for revogado, os eventos aparecem aqui." />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label="Eventos aguardando decisão">
      {list.items.map(item => <AdminEventRow key={item.id} event={item} onOpen={() => { setOpen(item); setNotice('') }}
        text={`${item.organizer.display_name} · ${plural(item.entries_count, 'inscrição', 'inscrições')}`}
        badge={item.pending.total > 0 ? <StateBadge tone="pending">{plural(item.pending.total, 'pendência', 'pendências')}</StateBadge> : undefined} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais eventos</Button>}
    {open && <RevokedEventSheet event={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        setNotice(message)
      }} />}
  </section>
}

