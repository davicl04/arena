import { useState } from 'react'
import { adminEventsPath } from '../api/admin'
import type { AdminEvent } from '../api/admin'
import type { User } from '../api/client'
import AdminGate from '../components/admin/AdminGate'
import { QueueBody } from '../components/admin/QueueBody'
import { toast } from '../components/toast/toastStore'
import { RevokedEventSheet } from '../components/admin/RevokedEventSheet'
import { StateBadge } from '../components/arena/StateBadge'
import { EventRow, RowList } from '../components/review/Rows'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { plural } from '../utils/format'

function RevokedEvents({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<AdminEvent>(adminEventsPath('revogacao'), onExpired)
  const [open, setOpen] = useState<AdminEvent | null>(null)
  return <QueueBody hint="Decida se cada evento segue ou é cancelado. Enquanto isso, as inscrições ficam suspensas e a gestão só lê os dados.">
    <ListMessage list={list} loadingText="Carregando eventos…" emptyTitle="Nada para decidir" emptyText="Quando um organizador com eventos abertos for revogado, os eventos aparecem aqui." />
    {list.items.length > 0 ? <RowList label="Eventos aguardando decisão">
      {list.items.map(item => <EventRow key={item.id} title={item.name} startsAt={item.starts_at} onPress={() => setOpen(item)}
        text={`${item.organizer.display_name} · ${plural(item.entries_count, 'inscrição', 'inscrições')}`}
        badge={item.pending.total > 0 ? <StateBadge tone="pending">{plural(item.pending.total, 'pendência', 'pendências')}</StateBadge> : undefined}
        status={item.pending.total > 0 ? plural(item.pending.total, 'pendência', 'pendências') : undefined} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais eventos" />
    {open ? <RevokedEventSheet event={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        toast.success(message)
      }} /> : null}
  </QueueBody>
}

/**
 * Fila "Eventos de organizador revogado": eventos publicados ou em andamento de quem perdeu a permissão, pela data de
 * início. Cada um segue com o organizador ou é cancelado com devolução. Só para `is_admin`.
 */
export default function AdminRevokedEventsScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  return <AdminGate user={user}><RevokedEvents onExpired={onExpired} /></AdminGate>
}
