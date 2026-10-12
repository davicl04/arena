import { useState } from 'react'
import { Banknote, Check, X } from 'lucide-react'
import { adminEventsPath, decideEvent, eventRefusalInput, refusalError } from '@/api/admin'
import type { AdminEvent } from '@/api/admin'
import { usePagedList } from '@/hooks/usePagedList'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { eventRefusalReasons } from '@/data/arena'
import type { EventRefusalReason } from '@/data/arena'
import { formatPrice } from '@/utils/format'
import { relativeTime } from '@/utils/relativeTime'
import { AdminEventInfo, AdminEventRow, AdminPoster, PixInformed, ReasonPanel } from './AdminEventParts'
import { ListState } from './AdminOrganizerRequests'

/** Folha do evento pago (AD1): cartaz, dados e Pix informado; Aprovar e publicar | Recusar com motivo. */
function PaidEventSheet({ event, onClose, onDecided, onExpired }: {
  event: AdminEvent; onClose: () => void; onDecided: (event: AdminEvent, message: string) => void; onExpired: () => void
}) {
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState<EventRefusalReason | null>(null)
  const [detail, setDetail] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? refusalError(reason, detail) : null

  async function approve() {
    const decided = await run(() => decideEvent(event.id, { decision: 'aprovar' }), 'Não foi possível aprovar o evento.')
    if (decided) onDecided(decided, `${event.name} foi aprovado e publicado.`)
  }
  async function refuse() {
    setAttempted(true)
    if (refusalError(reason, detail) || !reason) return
    const decided = await run(() => decideEvent(event.id, eventRefusalInput(reason, detail)), 'Não foi possível recusar o evento.')
    if (decided) onDecided(decided, `${event.name} voltou para rascunho com o motivo.`)
  }

  return <Sheet title="Evento pago" description={`Enviado por ${event.organizer.display_name}${event.submitted_at ? ` ${relativeTime(event.submitted_at)}` : ''}`} onClose={onClose}>
    <AdminPoster event={event} className="mt-1" />
    <AdminEventInfo event={event} />
    <PixInformed pix={event.pix} />
    {!refusing && <SheetActions>
      <Button disabled={busy} onClick={() => void approve()}><Check size={17} aria-hidden="true" />{busy ? 'Aprovando…' : 'Aprovar e publicar'}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setRefusing(true); setError('') }}><X size={17} aria-hidden="true" />Recusar</Button>
    </SheetActions>}
    {refusing && <ReasonPanel title="Motivo da recusa" options={eventRefusalReasons} option={reason} onOption={value => setReason(value as EventRefusalReason)}
      textLabel={`Detalhe para o organizador ${reason === 'outro' ? '(obrigatório)' : '(opcional)'}`} text={detail} onText={setDetail}
      error={problem} note="O evento volta para rascunho com o motivo; o organizador corrige e reenvia."
      confirmLabel="Recusar evento" busyLabel="Recusando…" busy={busy} onConfirm={() => void refuse()}
      onCancel={() => { setRefusing(false); setAttempted(false); setError('') }} />}
    <div aria-live="polite">{error && <p className={feedbackVariants()} role="alert">{error}</p>}</div>
  </Sheet>
}

/**
 * Fila "Eventos pagos" da administração (AD1): eventos pagos enviados para aprovação, do mais antigo ao mais recente.
 * Aprovar publica o evento; recusar o devolve ao rascunho com o motivo.
 */
export default function AdminPaidEvents({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<AdminEvent>(adminEventsPath('em_aprovacao'), onExpired)
  const [open, setOpen] = useState<AdminEvent | null>(null)
  const [notice, setNotice] = useState('')
  return <section aria-label="Eventos pagos">
    <p className="mb-3 flex items-start gap-2 text-[11.5px] leading-[1.5] text-ink-muted"><Banknote size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      Confira o Pix, o preço e as datas antes de publicar. O organizador recebe a decisão nas notificações.</p>
    <div aria-live="polite">{notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}</div>
    <ListState loading={list.loading} error={list.error} onRetry={list.reload} empty={!list.items.length}
      emptyTitle="Nada para aprovar" emptyText="Quando um organizador enviar um evento pago, ele aparece aqui e nas notificações." />
    {!list.loading && !list.error && list.items.length > 0 && <ul className="grid gap-2" aria-label="Eventos pagos para aprovar">
      {list.items.map(item => <AdminEventRow key={item.id} event={item} onOpen={() => { setOpen(item); setNotice('') }}
        text={`${item.organizer.display_name} · ${formatPrice(item.price_cents)}${item.submitted_at ? ` · ${relativeTime(item.submitted_at)}` : ''}`} />)}
    </ul>}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais eventos</Button>}
    {open && <PaidEventSheet event={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        setNotice(message)
      }} />}
  </section>
}
