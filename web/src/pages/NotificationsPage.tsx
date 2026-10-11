import { useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { Page, SocialUser } from '../api/client'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { PersonList, PersonRow } from '@/components/ui/person-row'
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
  if (list.error) return <div className={feedbackVariants()} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>
  return <>
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
    {list.items.length === 0 && busy
      ? <p role="status">Aprovando solicitações…</p>
      : list.items.length === 0
      ? <EmptyState Icon={Bell} title="Tudo em dia" text="As notificações das suas atividades estarão disponíveis em breve." />
      : <section aria-label="Solicitações para seguir">
        <div className="mt-1 mb-1.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-[7px] text-[14px]">Solicitações para seguir <span className="inline-grid h-[21px] min-w-[21px] place-items-center rounded-[11px] bg-[#005a3612] px-1 text-[10px] text-brand">{list.items.length}{list.hasMore ? '+' : ''}</span></h2>
          <Button variant="text" className="m-0 shrink-0" disabled={busy || list.busy} onClick={() => void approveAll()}>Aprovar todas</Button>
        </div>
        <PersonList>
          {list.items.map(({ user }) => <PersonRow key={user.id} person={user} onOpen={onOpenUser}
            actions={<>
              <IconButton tone="approve" aria-label={`Aprovar solicitação de ${user.name}`} disabled={busy} onClick={() => void resolve(user, true)}><Check size={18} /></IconButton>
              <IconButton tone="outline" aria-label={`Recusar solicitação de ${user.name}`} disabled={busy} onClick={() => void resolve(user, false)}><X size={18} /></IconButton>
            </>} />)}
        </PersonList>
        {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
        {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={busy || list.busy} onClick={() => void list.loadMore()}>Carregar mais solicitações</Button>}
      </section>}
  </>
}
