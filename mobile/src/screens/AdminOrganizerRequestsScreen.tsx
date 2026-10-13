import { useCallback, useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { User } from '../api/client'
import { ADMIN_ORGANIZERS_PATH, organizerRequestsPath } from '../api/admin'
import type { OrganizerQueue } from '../api/admin'
import { sportNames } from '../api/organizer'
import type { AdminOrganizer, AdminOrganizerRequest } from '../api/organizer'
import AdminGate from '../components/admin/AdminGate'
import { OrganizerRequestSheet, OrganizerSheet } from '../components/admin/OrganizerSheets'
import { StateBadge } from '../components/arena/StateBadge'
import { SectionTabs } from '../components/events/SectionTabs'
import { PersonRow, RowList } from '../components/review/Rows'
import { Hint, LiveNotice } from '../components/arena/controls'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { useSessionToken } from '../hooks/useSessionToken'
import type { StateTone } from '../data/arena'
import { announce } from '../utils/announce'
import { relativeTime, shortDate } from '../utils/relativeTime'

type AdminTab = OrganizerQueue | 'organizadores'
const tabs: { value: AdminTab; label: string }[] = [
  { value: 'em_analise', label: 'Para analisar' },
  { value: 'decididos', label: 'Decididos' },
  { value: 'organizadores', label: 'Organizadores' },
]
const stateBadge: Record<AdminOrganizerRequest['state'], [string, StateTone]> = {
  em_analise: ['Em análise', 'pending'],
  aprovado: ['Aprovado', 'open'],
  recusado: ['Recusado', 'danger'],
  cancelado: ['Cancelado', 'closed'],
}

type Shared = { token: string | null; onOpenProfile?: (userId: number) => void; onNotice: (text: string) => void; onExpired: () => void }

/** Fila "Para analisar" ou "Decididos" (`GET /admin/organizer-requests`). */
function RequestQueue({ queue, token, onOpenProfile, onNotice, onExpired }: Shared & { queue: OrganizerQueue }) {
  const list = usePagedList<AdminOrganizerRequest>(organizerRequestsPath(queue), onExpired)
  const [open, setOpen] = useState<AdminOrganizerRequest | null>(null)
  const pending = queue === 'em_analise'
  return <>
    <ListMessage list={list} loadingText="Carregando pedidos…" emptyTitle={pending ? 'Nada para analisar' : 'Nenhum pedido decidido'}
      emptyText={pending ? 'Quando chegar um novo pedido de organizador, ele aparece aqui.' : 'Os pedidos aprovados, recusados ou cancelados aparecem aqui.'} />
    {list.items.length > 0 ? <RowList label={pending ? 'Pedidos para analisar' : 'Pedidos decididos'}>
      {list.items.map(item => <PersonRow key={item.id} name={item.requester.name} avatarPath={item.requester.avatar_url} token={token} title={item.display_name}
        text={`${item.requester.name} · ${sportNames(item.sports)} · ${relativeTime(pending ? item.created_at : item.decided_at ?? item.created_at)}`}
        badge={pending ? undefined : <StateBadge tone={stateBadge[item.state][1]}>{stateBadge[item.state][0]}</StateBadge>}
        status={pending ? undefined : stateBadge[item.state][0]} onPress={() => setOpen(item)} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais pedidos" />
    {open ? <OrganizerRequestSheet item={open} token={token} onClose={() => setOpen(null)} onOpenProfile={onOpenProfile} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        onNotice(message)
      }}
      onStale={message => {
        // Já decidido ou cancelado em outro lugar: a folha fecha e a fila confere o estado atual.
        setOpen(null)
        onNotice(message)
        list.reload()
      }} /> : null}
  </>
}

/** Organizadores ativos (`GET /admin/organizers`), com a revogação na folha. */
function OrganizerList({ token, onOpenProfile, onNotice, onExpired }: Shared) {
  const list = usePagedList<AdminOrganizer>(ADMIN_ORGANIZERS_PATH, onExpired)
  const [open, setOpen] = useState<AdminOrganizer | null>(null)
  return <>
    <ListMessage list={list} loadingText="Carregando organizadores…" emptyTitle="Nenhum organizador ativo" emptyText="Quem tiver o pedido aprovado aparece aqui." />
    {list.items.length > 0 ? <RowList label="Organizadores ativos">
      {list.items.map(item => <PersonRow key={item.id} name={item.user.name} avatarPath={item.user.avatar_url} token={token} title={item.display_name}
        text={`${item.user.name} · desde ${shortDate(item.approved_at)}`} onPress={() => setOpen(item)} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais organizadores" />
    {open ? <OrganizerSheet item={open} token={token} onClose={() => setOpen(null)} onOpenProfile={onOpenProfile} onExpired={onExpired}
      onRevoked={() => {
        list.setItems(old => old.filter(item => item.id !== open.id))
        setOpen(null)
        onNotice(`Permissão de ${open.display_name} revogada.`)
      }} /> : null}
  </>
}

function OrganizerQueues({ onOpenProfile, onExpired }: Pick<Shared, 'onOpenProfile' | 'onExpired'>) {
  const token = useSessionToken()
  const [tab, setTab] = useState<AdminTab>('em_analise')
  const [notice, setNotice] = useState('')
  const say = useCallback((text: string) => { setNotice(text); announce(text) }, [])
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
    <Hint>Aprove quem pode criar campeonatos e provas. A pessoa recebe a decisão nas notificações.</Hint>
    <View style={{ marginTop: 10 }}>
      <SectionTabs label="Filas do organizador" items={tabs} value={tab} onChange={value => { setTab(value); setNotice('') }} />
    </View>
    <LiveNotice text={notice} />
    <View style={{ paddingTop: 8 }}>
      {tab === 'organizadores'
        ? <OrganizerList token={token} onOpenProfile={onOpenProfile} onNotice={say} onExpired={onExpired} />
        : <RequestQueue key={tab} queue={tab} token={token} onOpenProfile={onOpenProfile} onNotice={say} onExpired={onExpired} />}
    </View>
  </ScrollView>
}

/**
 * Fila "Pedidos de organizador" da administração (AD1): abas Para analisar | Decididos | Organizadores, folha do pedido
 * com Aprovar | Recusar (motivo obrigatório) e revogação dos organizadores ativos. Só para `is_admin`. `onOpenProfile`
 * leva ao perfil de quem pediu ("Ver perfil"); sem ele a folha só mostra os dados.
 */
export default function AdminOrganizerRequestsScreen({ user, onExpired, onOpenProfile }: { user: User; onExpired: () => void; onOpenProfile?: (userId: number) => void }) {
  return <AdminGate user={user}><OrganizerQueues onOpenProfile={onOpenProfile} onExpired={onExpired} /></AdminGate>
}
