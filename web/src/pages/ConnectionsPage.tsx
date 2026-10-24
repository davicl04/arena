import { useState } from 'react'
import { Lock, Users } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { SocialUser } from '../api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { PersonList, PersonRow } from '@/components/ui/person-row'
import { Tabs } from '@/components/ui/tabs'
import { usePagedList } from '../hooks/usePagedList'
import { reportActionError } from '../hooks/useSubmit'
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
  const people = list.items.map(item => 'user' in item ? item.user : item)
  async function remove(person: SocialUser) {
    setPending(person.id)
    try {
      if (tab === 'followers') await request<void>(`/me/followers/${person.id}`, 'DELETE')
      else await request<void>(`/users/${person.id}/follow`, 'DELETE')
      list.setItems(old => old.filter(item => ('user' in item ? item.user.id : item.id) !== person.id))
    } catch (cause) {
      reportActionError(cause, 'Não foi possível atualizar a conexão.', onExpired)
    } finally { setPending(null) }
  }
  const closed = list.error instanceof ApiError && list.error.status === 404
  const emptyText = mutual ? 'Nenhuma pessoa que você segue também segue esta conta.'
    : tab === 'followers' ? (own ? 'Quando alguém seguir você, aparecerá aqui.' : 'Esta conta ainda não tem seguidores.')
      : (own ? 'Você ainda não segue ninguém.' : 'Esta conta ainda não segue ninguém.')
  return <section aria-label={mutual ? 'Seguidores em comum' : 'Conexões'}>
    {mutual
      ? <p className="text-[11px] leading-[1.6] text-ink-muted">Pessoas que você segue e que também seguem esta conta.</p>
      : <Tabs variant="segmented" items={tabs} value={tab} onChange={onTab} label="Conexões" idPrefix="conn-tab-" controls="connections-list" />}
    <div id="connections-list" role={mutual ? undefined : 'tabpanel'} aria-labelledby={mutual ? undefined : `conn-tab-${tab}`}>
      {list.loading && <p role="status">Carregando…</p>}
      {closed && <EmptyState Icon={Lock} title="Lista fechada" text={mutual ? 'Não foi possível abrir esta lista.' : 'Esta conta é privada. Siga para ver seguidores e contas seguidas, quando a solicitação for aprovada.'} />}
      {list.error && !closed && <LoadError size="section" title={mutual ? 'Não foi possível carregar a lista' : 'Não foi possível carregar as conexões'} text={list.error.message} cause={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && !people.length && <EmptyState Icon={Users} title="Nenhuma pessoa por aqui" text={emptyText} />}
      <PersonList>
        {people.map(person => <PersonRow key={person.id} person={person} onOpen={onOpenUser}
          info={tab === 'following' && own && person.follows_you ? 'Segue você' : undefined}
          actions={own && !mutual ? <Button variant="secondary" size="compact" disabled={pending !== null} onClick={() => void remove(person)}>
            {tab === 'followers' ? 'Remover' : 'Deixar de seguir'}</Button> : undefined} />)}
      </PersonList>
      {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
      {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais pessoas</Button>}
    </div>
  </section>
}
