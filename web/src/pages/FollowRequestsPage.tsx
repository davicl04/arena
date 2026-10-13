import { useState } from 'react'
import { Check, UserCheck, X } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { Page, SocialUser } from '../api/client'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { PersonList, PersonRow } from '@/components/ui/person-row'
import type { NotificationSummaryState } from '../hooks/useNotificationSummary'
import { usePagedList } from '../hooks/usePagedList'

type FollowRequest = { user: SocialUser; state: string }

/**
 * Pedidos para seguir (`/me/follow-requests`): aprovar, recusar e "Aprovar todas". Depois de cada ação o resumo das
 * notificações é lido de novo, para o sino e a linha-resumo acompanharem a fila.
 */
export default function FollowRequestsPage({ summary, onOpenUser, onExpired }: {
  /** Resumo compartilhado (ArenaPage): lido de novo depois de aprovar ou recusar. */
  summary: NotificationSummaryState
  onOpenUser: (id: number) => void
  onExpired: () => void
}) {
  const list = usePagedList<FollowRequest>('/me/follow-requests', onExpired)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function failed(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
    setError(cause instanceof Error && cause.message ? cause.message : fallback)
  }
  async function resolve(person: SocialUser, approve: boolean) {
    setBusy(true); setError('')
    try {
      await request(`/me/follow-requests/${person.id}?approve=${approve}`, 'PUT')
      list.setItems(old => old.filter(item => item.user.id !== person.id))
    } catch (cause) {
      failed(cause, 'Não foi possível responder à solicitação.')
    } finally { setBusy(false); void summary.reload() }
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
      failed(cause, 'Não foi possível aprovar todas as solicitações.')
    } finally { list.reload(); setBusy(false); void summary.reload() }
  }

  if (list.loading) return <p role="status">Carregando pedidos…</p>
  return <>
    <div aria-live="polite">{error && <p className={feedbackVariants()} role="alert">{error}</p>}</div>
    {list.error
      ? <div className={feedbackVariants()} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>
      : list.items.length === 0 && busy
      ? <p role="status">Aprovando solicitações…</p>
      : list.items.length === 0
      ? <EmptyState Icon={UserCheck} title="Tudo em dia" text="Quando alguém pedir para seguir você, o pedido aparece aqui para você aprovar ou recusar." />
      : <section aria-label="Pedidos para seguir">
        <div className="mt-1 mb-1.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-[7px] text-[14px]">Pedidos para seguir <span className="inline-grid h-[21px] min-w-[21px] place-items-center rounded-[11px] bg-[#005a3612] px-1 text-[10px] text-brand">{list.items.length}{list.hasMore ? '+' : ''}</span></h2>
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
        {list.hasMore && <Button variant="secondary" className="mt-[18px] mb-2 w-full" disabled={busy || list.busy} onClick={() => void list.loadMore()}>Carregar mais solicitações</Button>}
      </section>}
  </>
}
