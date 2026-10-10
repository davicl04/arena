import { useState } from 'react'
import { Lock, Users } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { SocialUser } from '../api/client'
import EmptyState from '../components/EmptyState'
import PersonRow from '../components/PersonRow'
import { usePagedList } from '../hooks/usePagedList'
import type { ConnectionsTab } from '../data/arena'

type Entry = { user: SocialUser; state: string }
const tabs: { value: ConnectionsTab; label: string }[] = [{ value: 'followers', label: 'Seguidores' }, { value: 'following', label: 'Seguindo' }]

export default function ConnectionsPage({ ownUserId, userId, tab, mutual, onTab, onOpenUser, onExpired }: {
  ownUserId: number
  userId: number
  tab: ConnectionsTab
  mutual: boolean
  onTab: (tab: ConnectionsTab) => void
  onOpenUser: (id: number) => void
  onExpired: () => void
}) {
  const own = userId === ownUserId
  const path = mutual ? `/users/${userId}/mutual-followers` : `/users/${userId}/${tab}`
  const list = usePagedList<Entry | SocialUser>(path, onExpired)
  const [pending, setPending] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')
  const people = list.items.map(item => 'user' in item ? item.user : item)
  async function remove(person: SocialUser) {
    setPending(person.id); setActionError('')
    try {
      if (tab === 'followers') await request<void>(`/me/followers/${person.id}`, 'DELETE')
      else await request<void>(`/users/${person.id}/follow`, 'DELETE')
      list.setItems(old => old.filter(item => ('user' in item ? item.user.id : item.id) !== person.id))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a conexão.')
    } finally { setPending(null) }
  }
  const closed = list.error instanceof ApiError && list.error.status === 404
  const emptyText = mutual ? 'Nenhuma pessoa que você segue também segue esta conta.'
    : tab === 'followers' ? (own ? 'Quando alguém seguir você, aparecerá aqui.' : 'Esta conta ainda não tem seguidores.')
      : (own ? 'Você ainda não segue ninguém.' : 'Esta conta ainda não segue ninguém.')
  return <section aria-label={mutual ? 'Seguidores em comum' : 'Conexões'}>
    {mutual
      ? <p className="muted">Pessoas que você segue e que também seguem esta conta.</p>
      : <div className="segmented" role="tablist" aria-label="Conexões">
        {tabs.map(item => <button key={item.value} id={`conn-tab-${item.value}`} role="tab" aria-selected={tab === item.value} aria-controls="connections-list"
          className={tab === item.value ? 'active' : ''} onClick={() => onTab(item.value)}>{item.label}</button>)}
      </div>}
    <div id="connections-list" role={mutual ? undefined : 'tabpanel'} aria-labelledby={mutual ? undefined : `conn-tab-${tab}`}>
      {list.loading && <p role="status">Carregando…</p>}
      {closed && <EmptyState Icon={Lock} title="Lista fechada" text={mutual ? 'Não foi possível abrir esta lista.' : 'Esta conta é privada. Siga para ver seguidores e contas seguidas, quando a solicitação for aprovada.'} />}
      {list.error && !closed && <div className="error" role="alert">{list.error.message} <button className="text-button" onClick={list.reload}>Tentar novamente</button></div>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {!list.loading && !list.error && !people.length && <EmptyState Icon={Users} title="Nenhuma pessoa por aqui" text={emptyText} />}
      <div className="person-list">
        {people.map(person => <PersonRow key={person.id} person={person} onOpen={onOpenUser}
          info={tab === 'following' && own && person.follows_you ? 'Segue você' : undefined}
          actions={own && !mutual ? <button className="secondary compact" disabled={pending !== null} onClick={() => void remove(person)}>
            {tab === 'followers' ? 'Remover' : 'Deixar de seguir'}</button> : undefined} />)}
      </div>
      {list.moreError && <p className="error" role="alert">{list.moreError}</p>}
      {list.hasMore && <button className="secondary full-width" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais pessoas</button>}
    </div>
  </section>
}
