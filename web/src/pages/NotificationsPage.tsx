import { useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { Page, SocialUser } from '../api/client'
import EmptyState from '../components/EmptyState'
import PersonRow from '../components/PersonRow'
import { usePagedList } from '../hooks/usePagedList'

type FollowRequest = { user: SocialUser; state: string }

/** Provisório: as solicitações para seguir ficam aqui até a revisão definitiva das notificações. */
export default function NotificationsPage({ onOpenUser, onExpired }: { onOpenUser: (id: number) => void; onExpired: () => void }) {
  const list = usePagedList<FollowRequest>('/me/follow-requests', onExpired)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function resolve(person: SocialUser, approve: boolean) {
    setBusy(true); setError('')
    try {
      await request(`/me/follow-requests/${person.id}?approve=${approve}`, 'PUT')
      list.setItems(old => old.filter(item => item.user.id !== person.id))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error ? cause.message : 'Não foi possível responder à solicitação.')
    } finally { setBusy(false) }
  }
  async function approveAll() {
    setBusy(true); setError('')
    try {
      // Aprovar remove itens da fila: cada lote começa novamente na primeira página.
      while (true) {
        const page = await request<Page<FollowRequest>>('/me/follow-requests')
        if (page.items.length === 0) break
        for (const item of page.items) {
          await request(`/me/follow-requests/${item.user.id}?approve=true`, 'PUT')
          list.setItems(old => old.filter(entry => entry.user.id !== item.user.id))
        }
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error ? cause.message : 'Não foi possível aprovar todas as solicitações.')
    } finally { list.reload(); setBusy(false) }
  }
  if (list.loading) return <p role="status">Carregando notificações…</p>
  if (list.error) return <div className="error" role="alert">{list.error.message} <button className="text-button" onClick={list.reload}>Tentar novamente</button></div>
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    {list.items.length === 0 && busy
      ? <p role="status">Aprovando solicitações…</p>
      : list.items.length === 0
      ? <EmptyState Icon={Bell} title="Tudo em dia" text="As notificações das suas atividades estarão disponíveis em breve." />
      : <section aria-label="Solicitações para seguir">
        <div className="list-head">
          <h2>Solicitações para seguir <span className="social-count-badge">{list.items.length}{list.hasMore ? '+' : ''}</span></h2>
          <button className="text-button" disabled={busy || list.busy} onClick={() => void approveAll()}>Aprovar todas</button>
        </div>
        <div className="person-list">
          {list.items.map(({ user }) => <PersonRow key={user.id} person={user} onOpen={onOpenUser}
            actions={<>
              <button className="icon-action approve" aria-label={`Aprovar solicitação de ${user.name}`} disabled={busy} onClick={() => void resolve(user, true)}><Check size={18} /></button>
              <button className="icon-action reject" aria-label={`Recusar solicitação de ${user.name}`} disabled={busy} onClick={() => void resolve(user, false)}><X size={18} /></button>
            </>} />)}
        </div>
        {list.moreError && <p className="error" role="alert">{list.moreError}</p>}
        {list.hasMore && <button className="secondary full-width" disabled={busy || list.busy} onClick={() => void list.loadMore()}>Carregar mais solicitações</button>}
      </section>}
  </>
}
