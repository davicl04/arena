import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { courtKindLabel, courtSuggestionsPath } from '../api/admin'
import type { AdminCourtSuggestion, CourtQueue } from '../api/admin'
import type { User } from '../api/client'
import AdminGate from '../components/admin/AdminGate'
import { TileRow } from '../components/admin/AdminMatchParts'
import { CourtSheet } from '../components/admin/CourtSheet'
import { Hint } from '../components/arena/controls'
import { toast } from '../components/toast/toastStore'
import { StateBadge } from '../components/arena/StateBadge'
import { SectionTabs } from '../components/events/SectionTabs'
import { RowList } from '../components/review/Rows'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { relativeTime } from '../utils/relativeTime'

const tabs: { value: CourtQueue; label: string }[] = [
  { value: 'em_revisao', label: 'Para analisar' },
  { value: 'decididas', label: 'Decididas' },
]

/** Fila "Para analisar" (com a folha de decisão) ou "Decididas" (só leitura). */
function CourtQueueList({ queue, onExpired }: { queue: CourtQueue; onExpired: () => void }) {
  const list = usePagedList<AdminCourtSuggestion>(courtSuggestionsPath(queue), onExpired)
  const [open, setOpen] = useState<AdminCourtSuggestion | null>(null)
  const pending = queue === 'em_revisao'
  return <>
    <ListMessage list={list} loadingText="Carregando sugestões…" emptyTitle={pending ? 'Nada para analisar' : 'Nenhuma sugestão decidida'}
      emptyText={pending ? 'Quando um time sugerir uma quadra que não está no catálogo, ela aparece aqui.' : 'As quadras publicadas e as rejeitadas aparecem aqui.'} />
    {list.items.length > 0 ? <RowList label={pending ? 'Sugestões para analisar' : 'Sugestões decididas'}>
      {list.items.map(item => {
        const { court, suggested_by: by, origin_match: origin } = item
        const base = [court.address ?? 'Sem endereço', `${courtKindLabel[court.kind]} · ${court.city.name} · ${court.city.state}`]
        const author = by?.name ?? 'conta removida'
        if (pending) {
          const duplicate = item.possible_duplicates.length > 0
          return <TileRow key={court.id} icon="map-pin" title={court.name} onOpen={() => setOpen(item)}
            lines={[...base, `Sugerida por ${author} ${relativeTime(item.created_at)}${origin ? ` · partida #${origin.id}` : ''}`]}
            badge={duplicate ? <StateBadge tone="pending">Possível duplicidade</StateBadge> : undefined} status={duplicate ? 'Possível duplicidade' : undefined} />
        }
        const published = court.state === 'publicada'
        const why = item.duplicate_of ? `Duplicada de ${item.duplicate_of.name}${item.review_reason ? `: ${item.review_reason}` : ''}` : item.review_reason
        return <TileRow key={court.id} icon="map-pinned" title={court.name}
          lines={[...base, `Sugerida por ${author}${item.reviewed_at ? ` · decidida ${relativeTime(item.reviewed_at)}` : ''}`, ...(why ? [why] : [])]}
          badge={<StateBadge tone={published ? 'open' : 'danger'}>{published ? 'Publicada' : 'Rejeitada'}</StateBadge>} status={published ? 'Publicada' : 'Rejeitada'} />
      })}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais sugestões" />
    {open ? <CourtSheet item={open} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={message => {
        list.setItems(old => old.filter(item => item.court.id !== open.court.id))
        setOpen(null)
        toast.success(message)
      }}
      // Já decidida (404/409): o toast de aviso mostra a mensagem; a fila relê.
      onStale={() => { setOpen(null); list.reload() }} /> : null}
  </>
}

function CourtQueues({ onExpired }: { onExpired: () => void }) {
  const [tab, setTab] = useState<CourtQueue>('em_revisao')
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
    <Hint>As quadras sugeridas valem só na partida de origem até a sua decisão. Publique as que existem; quem sugeriu recebe a resposta nas notificações.</Hint>
    <View style={{ marginTop: 10 }}>
      <SectionTabs label="Filas de quadras" items={tabs} value={tab} onChange={setTab} />
    </View>
    <View style={{ paddingTop: 8 }}>
      <CourtQueueList key={tab} queue={tab} onExpired={onExpired} />
    </View>
  </ScrollView>
}

/**
 * Fila "Sugestões de quadra" da administração (0002-jogar, seção 10.4): abas Para analisar | Decididas. Publicar coloca a
 * quadra no catálogo da cidade; rejeitar exige o motivo, salvo quando aponta a quadra duplicada. Só para `is_admin`.
 */
export default function AdminCourtSuggestionsScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  return <AdminGate user={user}><CourtQueues onExpired={onExpired} /></AdminGate>
}
