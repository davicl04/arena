import { useState } from 'react'
import { REFUND_DISPUTES_PATH } from '../api/admin'
import type { RefundDispute } from '../api/admin'
import type { User } from '../api/client'
import { subjectName } from '../api/receipts'
import AdminGate from '../components/admin/AdminGate'
import { DisputeSheet } from '../components/admin/DisputeSheet'
import { QueueBody, useNotice } from '../components/admin/QueueBody'
import { EventRow, RowList } from '../components/review/Rows'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { useSessionToken } from '../hooks/useSessionToken'
import { formatPrice } from '../utils/format'
import { relativeTime } from '../utils/relativeTime'

function RefundDisputes({ onExpired }: { onExpired: () => void }) {
  const token = useSessionToken()
  const list = usePagedList<RefundDispute>(REFUND_DISPUTES_PATH, onExpired)
  const [open, setOpen] = useState<RefundDispute | null>(null)
  const { notice, say, clear } = useNotice()
  return <QueueBody hint="O participante disse que a devolução não chegou. Confira o comprovante e o motivo; o Arena não movimenta dinheiro." notice={notice}>
    <ListMessage list={list} loadingText="Carregando devoluções…" emptyTitle="Nenhuma devolução contestada" emptyText="Quando um participante contestar uma devolução, ela aparece aqui e nas notificações." />
    {list.items.length > 0 ? <RowList label="Devoluções para decidir">
      {list.items.map(item => <EventRow key={item.entry.id} title={subjectName(item.entry.subject)} startsAt={item.event.starts_at} onPress={() => { setOpen(item); clear() }}
        text={`${item.event.name} · ${formatPrice(item.entry.price_cents)} · contestada ${relativeTime(item.contested_at)}`} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais devoluções" />
    {open ? <DisputeSheet dispute={open} token={token} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.entry.id !== decided.entry.id))
        setOpen(null)
        say(message)
      }} /> : null}
  </QueueBody>
}

/** Fila "Devoluções contestadas": a contestação mais antiga primeiro; a administração decide cada uma. Só para `is_admin`. */
export default function AdminRefundDisputesScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  return <AdminGate user={user}><RefundDisputes onExpired={onExpired} /></AdminGate>
}
