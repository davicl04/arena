import { useState } from 'react'
import { adminEventsPath } from '../api/admin'
import type { AdminEvent } from '../api/admin'
import type { User } from '../api/client'
import AdminGate from '../components/admin/AdminGate'
import { PaidEventSheet } from '../components/admin/PaidEventSheet'
import { QueueBody, useNotice } from '../components/admin/QueueBody'
import { EventRow, RowList } from '../components/review/Rows'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { formatPrice } from '../utils/format'
import { relativeTime } from '../utils/relativeTime'

function PaidEvents({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<AdminEvent>(adminEventsPath('em_aprovacao'), onExpired)
  const [open, setOpen] = useState<AdminEvent | null>(null)
  const { notice, say, clear } = useNotice()
  return <QueueBody hint="Confira o Pix, o preço e as datas antes de publicar. O organizador recebe a decisão nas notificações." notice={notice}>
    <ListMessage list={list} loadingText="Carregando eventos…" emptyTitle="Nada para aprovar" emptyText="Quando um organizador enviar um evento pago, ele aparece aqui e nas notificações." />
    {list.items.length > 0 ? <RowList label="Eventos pagos para aprovar">
      {list.items.map(item => <EventRow key={item.id} title={item.name} startsAt={item.starts_at} onPress={() => { setOpen(item); clear() }}
        text={`${item.organizer.display_name} · ${formatPrice(item.price_cents)}${item.submitted_at ? ` · ${relativeTime(item.submitted_at)}` : ''}`} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais eventos" />
    {open ? <PaidEventSheet event={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        say(message)
      }} /> : null}
  </QueueBody>
}

/**
 * Fila "Eventos pagos" da administração (AD1): eventos pagos enviados para aprovação, do mais antigo ao mais recente.
 * Aprovar publica o evento; recusar o devolve ao rascunho com o motivo. Só para `is_admin`.
 */
export default function AdminPaidEventsScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  return <AdminGate user={user}><PaidEvents onExpired={onExpired} /></AdminGate>
}
