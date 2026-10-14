import { useState } from 'react'
import type { User } from '../api/client'
import { WALKOVER_DISPUTES_PATH } from '../api/admin'
import type { DisputeMatch, WalkoverDispute } from '../api/admin'
import type { WalkoverOut } from '../api/matches'
import AdminGate from '../components/admin/AdminGate'
import { TileRow } from '../components/admin/AdminMatchParts'
import { matchTitle } from '../components/admin/adminMatchView'
import { QueueBody } from '../components/admin/QueueBody'
import { toast } from '../components/toast/toastStore'
import { WalkoverSheet, modality } from '../components/admin/WalkoverSheet'
import { StateBadge } from '../components/arena/StateBadge'
import { RowList } from '../components/review/Rows'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { formatDeadline } from '../utils/format'
import { relativeTime } from '../utils/relativeTime'

/** Resumo da linha: a modalidade e o horário, depois quem registrou e quem contestou. */
const rowLines = (match: DisputeMatch, walkover: WalkoverOut) => [
  `${modality(match)}${match.starts_at ? ` · ${formatDeadline(match.starts_at)}` : ''}`,
  `Registrado por ${walkover.registered_by?.name ?? 'conta indisponível'} · contestado por ${walkover.contested_by?.name ?? 'conta indisponível'}${walkover.contested_at ? ` ${relativeTime(walkover.contested_at)}` : ''}`,
]

function WalkoverDisputes({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<WalkoverDispute>(WALKOVER_DISPUTES_PATH, onExpired)
  const [open, setOpen] = useState<WalkoverDispute | null>(null)
  return <QueueBody hint="O lado que faltou disse que compareceu. Leia os dois relatos e o chat; a partida só fecha com a sua decisão.">
    <ListMessage list={list} loadingText="Carregando W.O. contestados…" emptyTitle="Nenhum W.O. contestado"
      emptyText="Quando um time contestar um W.O., ele aparece aqui e nas notificações." />
    {list.items.length > 0 ? <RowList label="W.O. para decidir">
      {list.items.map(item => <TileRow key={item.match.id} icon="gavel" title={matchTitle(item.match.sides)} lines={rowLines(item.match, item.walkover)}
        badge={<StateBadge tone="pending">Aguarda decisão</StateBadge>} status="Aguarda decisão" onOpen={() => setOpen(item)} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais W.O." />
    {open ? <WalkoverSheet dispute={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={message => {
        list.setItems(old => old.filter(item => item.match.id !== open.match.id))
        setOpen(null)
        toast.success(message)
      }}
      // Já decidido (404/409): o toast de aviso mostra a mensagem; a fila relê.
      onStale={() => { setOpen(null); list.reload() }} /> : null}
  </QueueBody>
}

/**
 * Fila "W.O. contestados" da administração (0002-jogar, seção 10.7): a contestação mais antiga primeiro; a administração
 * mantém ou anula cada W.O., sempre com a justificativa. Só para `is_admin`.
 */
export default function AdminWalkoverDisputesScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  return <AdminGate user={user}><WalkoverDisputes onExpired={onExpired} /></AdminGate>
}
