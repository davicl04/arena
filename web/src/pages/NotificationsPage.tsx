import { useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { Page, SocialUser } from '../api/client'
import { getUnreadCount, markAllNotificationsRead, markNotificationRead, NOTIFICATIONS_PATH } from '../api/notifications'
import type { ArenaNotification } from '../api/notifications'
import { NotificationItem } from '../components/notifications/NotificationItem'
import { notificationView } from '../data/notifications'
import type { NotificationTarget } from '../data/notifications'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { PersonList, PersonRow } from '@/components/ui/person-row'
import { usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'

type FollowRequest = { user: SocialUser; state: string }
const countBadge = 'inline-grid h-[21px] min-w-[21px] place-items-center rounded-[11px] bg-[#005a3612] px-1 text-[10px] text-brand'

/**
 * Notificações: os pedidos para seguir (`/me/follow-requests`) e as atividades da conta (`/me/notifications`):
 * convites e pedidos de times e decisões do organizador. Tocar marca como lida e leva à tela do aviso.
 */
export default function NotificationsPage({ onOpenUser, onNavigate, onExpired }: {
  onOpenUser: (id: number) => void
  /** Destino da notificação (Meus times com o time, ou o Menu). */
  onNavigate: (target: NotificationTarget) => void
  onExpired: () => void
}) {
  const list = usePagedList<FollowRequest>('/me/follow-requests', onExpired)
  const feed = usePagedList<ArenaNotification>(NOTIFICATIONS_PATH, onExpired)
  const unread = useResource(getUnreadCount, onExpired)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const loadedUnread = feed.items.filter(item => !item.read_at).length
  const unreadCount = Math.max(typeof unread.data?.unread_count === 'number' ? unread.data.unread_count : 0, loadedUnread)

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
      failed(cause, 'Não foi possível aprovar todas as solicitações.')
    } finally { list.reload(); setBusy(false) }
  }
  async function open(notification: ArenaNotification) {
    const { target } = notificationView(notification)
    setError(''); setNotice('')
    if (!notification.read_at) {
      setBusy(true)
      try {
        const result = await markNotificationRead(notification.id)
        const readAt = new Date().toISOString()
        feed.setItems(old => old.map(item => item.id === notification.id ? { ...item, read_at: item.read_at ?? readAt } : item))
        unread.setData(result)
      } catch (cause) {
        // Sem destino, o erro fica na tela; com destino, a navegação segue (marcar como lida é secundário).
        if (cause instanceof ApiError && cause.status === 401) { onExpired(); return }
        if (!target) failed(cause, 'Não foi possível marcar a notificação como lida.')
      } finally { setBusy(false) }
    }
    if (target) onNavigate(target)
  }
  async function readAll() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await markAllNotificationsRead()
      const readAt = new Date().toISOString()
      feed.setItems(old => old.map(item => item.read_at ? item : { ...item, read_at: readAt }))
      unread.setData(result)
      setNotice('Todas as notificações foram marcadas como lidas.')
    } catch (cause) {
      failed(cause, 'Não foi possível marcar as notificações como lidas.')
    } finally { setBusy(false) }
  }

  if (list.loading || feed.loading) return <p role="status">Carregando notificações…</p>
  if (list.error) return <div className={feedbackVariants()} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>
  const empty = list.items.length === 0 && feed.items.length === 0 && !feed.error
  return <>
    <div aria-live="polite">
      {error && <p className={feedbackVariants()} role="alert">{error}</p>}
      {notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}
    </div>
    {list.items.length === 0 && busy && !feed.items.length
      ? <p role="status">Aprovando solicitações…</p>
      : empty
      ? <EmptyState Icon={Bell} title="Tudo em dia" text="Convites e pedidos dos seus times e as respostas da administração aparecem aqui." />
      : <>
        {list.items.length > 0 && <section aria-label="Solicitações para seguir">
          <div className="mt-1 mb-1.5 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-[7px] text-[14px]">Solicitações para seguir <span className={countBadge}>{list.items.length}{list.hasMore ? '+' : ''}</span></h2>
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
        <section aria-label="Atividades">
          <div className="mt-3 mb-1.5 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-[7px] text-[14px]">Atividades{unreadCount > 0 && <span className={countBadge}>{unreadCount}<span className="sr-only"> {unreadCount === 1 ? 'não lida' : 'não lidas'}</span></span>}</h2>
            {unreadCount > 0 && <Button variant="text" className="m-0 shrink-0" disabled={busy} onClick={() => void readAll()}>Marcar todas como lidas</Button>}
          </div>
          {feed.error
            ? <div className={feedbackVariants()} role="alert">{feed.error.message} <Button variant="text" onClick={feed.reload}>Tentar novamente</Button></div>
            : feed.items.length === 0
            ? <p className="rounded-card bg-white px-3.5 py-4 text-[11.5px] leading-[1.6] text-ink-muted">Nenhuma atividade por enquanto. Convites e pedidos dos seus times e as respostas da administração aparecem aqui.</p>
            : <ul className="overflow-hidden rounded-card bg-white" aria-label="Notificações da conta">
              {feed.items.map(item => <NotificationItem key={item.id} notification={item} busy={busy} onOpen={notification => void open(notification)} />)}
            </ul>}
          {feed.moreError && <p className={feedbackVariants()} role="alert">{feed.moreError}</p>}
          {feed.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={busy || feed.busy} onClick={() => void feed.loadMore()}>Carregar mais notificações</Button>}
        </section>
      </>}
  </>
}
