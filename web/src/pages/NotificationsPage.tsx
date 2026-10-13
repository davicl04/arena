import { useState } from 'react'
import { ApiError } from '../api/client'
import type { SocialUser } from '../api/client'
import { markAllNotificationsRead, markNotificationRead, notificationsPath } from '../api/notifications'
import type { ArenaNotification, NotificationFilterCategory } from '../api/notifications'
import { FollowRequestsLine } from '../components/notifications/FollowRequestsLine'
import { NotificationItem } from '../components/notifications/NotificationItem'
import { NotificationsPlate } from '../components/notifications/NotificationsPlate'
import { PendingCard } from '../components/notifications/PendingCard'
import { groupByDay, notificationView } from '../data/notifications'
import type { NotificationFilter, NotificationTarget } from '../data/notifications'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { ListHeading } from '@/components/ui/list-row'
import { toast } from '@/components/ui/toast'
import type { NotificationSummaryState } from '../hooks/useNotificationSummary'
import { useNow } from '../hooks/useNow'
import { usePagedList } from '../hooks/usePagedList'
import { usePendingNotifications } from '../hooks/usePendingNotifications'
import { reportActionError } from '../hooks/useSubmit'

type FollowRequest = { user: SocialUser; state: string }
const countPill = 'ml-1.5 inline-grid h-[19px] min-w-[19px] place-items-center rounded-[10px] bg-[#005a3612] px-1 align-middle text-[10px] font-bold tracking-normal text-brand'
const categoryFilters: readonly NotificationFilter[] = ['partidas', 'times', 'eventos']

/** O Coliseu da marca como ícone do estado vazio (o `EmptyState` passa só o tamanho). */
function ColiseumIcon({ size = 26 }: { size?: number | string }) {
  return <span aria-hidden="true" style={{ width: Number(size) * 1.25, height: Number(size) }}
    className="inline-block bg-current mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
}

/**
 * Notificações: placa `forest` com o resumo e os filtros (Tudo, Para responder, Partidas, Times, Eventos) e, abaixo, o
 * bloco "Para responder" fixado no topo (`GET /me/notifications/pending`) seguido das notificações agrupadas por dia
 * (`GET /me/notifications?categoria=&pendente=false`). Os pedidos para seguir viram uma linha-resumo no topo de *Tudo*.
 * Tocar marca como lida e leva à tela do aviso, onde a resposta acontece; ler não resolve a pendência.
 */
export default function NotificationsPage({ isAdmin = false, summary, filter, onFilter, onBack, onOpenFollowRequests, onNavigate, onExpired }: {
  /** Conta administrativa: tipos que vão ao organizador e à administração levam à fila do Menu. */
  isAdmin?: boolean
  /** Resumo compartilhado (ArenaPage): sino, chips e linha de resumo; atualizado aqui ao ler. */
  summary: NotificationSummaryState
  filter: NotificationFilter
  onFilter: (filter: NotificationFilter) => void
  onBack: () => void
  onOpenFollowRequests: () => void
  /** Destino da notificação (Meus times com o time, o Menu, as telas do evento, a placa do Jogar, a partida ou as filas da administração). */
  onNavigate: (target: NotificationTarget) => void
  onExpired: () => void
}) {
  const now = useNow(60_000)
  const categoria: NotificationFilterCategory | undefined = categoryFilters.includes(filter) ? filter as NotificationFilterCategory : undefined
  const followCount = summary.data?.follow_requests_count ?? 0
  const pending = usePendingNotifications(onExpired, { categoria, limit: 50 })
  const feed = usePagedList<ArenaNotification>(filter === 'responder' ? null : notificationsPath({ categoria, pendente: false }), onExpired)
  const follow = usePagedList<FollowRequest>(filter === 'tudo' && followCount > 0 ? '/me/follow-requests' : null, onExpired)
  const [busy, setBusy] = useState(false)
  /** Leituras feitas nesta tela: valem sobre as listas já carregadas, sem esperar nova consulta. */
  const [readAt, setReadAt] = useState<Record<number, string>>({})
  const [allReadAt, setAllReadAt] = useState<string | null>(null)
  const withRead = (item: ArenaNotification): ArenaNotification => item.read_at ? item : { ...item, read_at: readAt[item.id] ?? allReadAt }

  async function open(notification: ArenaNotification) {
    const { target } = notificationView(notification, { isAdmin })
    if (!withRead(notification).read_at) {
      setBusy(true)
      try {
        const result = await markNotificationRead(notification.id)
        setReadAt(old => ({ ...old, [notification.id]: new Date().toISOString() }))
        summary.setData(result)
      } catch (cause) {
        // Sem destino, o erro vira toast; com destino, a navegação segue (marcar como lida é secundário), exceto sessão expirada.
        if (target) {
          if (cause instanceof ApiError && cause.status === 401) { onExpired(); return }
        } else reportActionError(cause, 'Não foi possível marcar a notificação como lida.', onExpired)
      } finally { setBusy(false) }
    }
    if (target) onNavigate(target)
  }
  async function readAll() {
    setBusy(true)
    try {
      const result = await markAllNotificationsRead()
      setAllReadAt(new Date().toISOString())
      summary.setData(result)
      toast.success('Todas as notificações foram marcadas como lidas.')
    } catch (cause) {
      reportActionError(cause, 'Não foi possível marcar as notificações como lidas.', onExpired)
    } finally { setBusy(false) }
  }

  const loading = pending.loading || (filter !== 'responder' && feed.loading)
  const pendingItems = pending.items.map(withRead)
  const groups = groupByDay(feed.items.map(withRead), now)
  const hasFollow = filter === 'tudo' && followCount > 0
  const nothing = !pending.error && !feed.error && pendingItems.length === 0 && feed.items.length === 0 && !hasFollow
  return <div className="min-h-full">
    <NotificationsPlate summary={summary.data} filter={filter} busy={busy} onFilter={onFilter} onBack={onBack} onReadAll={() => void readAll()} />
    <div className="px-4 pt-1">
      {loading
        ? <p role="status" className="mt-4">Carregando notificações…</p>
        : nothing
        ? filter === 'tudo'
          ? <EmptyState Icon={ColiseumIcon} title="Tudo em dia" text="Convites e pedidos dos seus times, propostas e partidas, inscrições em campeonatos e provas e as respostas da administração aparecem aqui." />
          : <p className="mt-6 text-center text-[12px] text-ink-muted">Nada neste filtro.</p>
        : <>
          {hasFollow && follow.items.length > 0 && <div className="mt-3.5"><FollowRequestsLine people={follow.items.map(item => item.user)} count={followCount} onOpen={onOpenFollowRequests} /></div>}
          {hasFollow && follow.error && <LoadError size="section" title="Não foi possível carregar os pedidos para seguir" text={follow.error.message} cause={follow.error} onRetry={follow.reload} />}
          {pending.error && <section aria-label="Para responder">
            <ListHeading>Para responder</ListHeading>
            <LoadError size="section" title="Não foi possível carregar as pendências" text={pending.error} cause={pending.errorCause} onRetry={pending.reload} />
          </section>}
          {pendingItems.length > 0 && <section aria-label="Para responder">
            <ListHeading>Para responder<span className={countPill}>{pendingItems.length}</span></ListHeading>
            <div className="grid gap-2">
              {pendingItems.map(item => <PendingCard key={item.id} notification={item} now={now} busy={busy} isAdmin={isAdmin} onOpen={notification => void open(notification)} />)}
            </div>
          </section>}
          {feed.error && <section aria-label="Notificações da conta">
            <ListHeading>Notificações</ListHeading>
            <LoadError size="section" title="Não foi possível carregar as notificações" text={feed.error.message} cause={feed.error} onRetry={feed.reload} />
          </section>}
          {groups.map(group => <section key={group.label} aria-label={group.label}>
            <ListHeading>{group.label}</ListHeading>
            <ul className="overflow-hidden rounded-card bg-white" aria-label={`Notificações · ${group.label}`}>
              {group.items.map(item => <NotificationItem key={item.id} notification={item} busy={busy} isAdmin={isAdmin} onOpen={notification => void open(notification)} />)}
            </ul>
          </section>)}
          {feed.moreError && <p className={feedbackVariants()} role="alert">{feed.moreError}</p>}
          {feed.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={busy || feed.busy} onClick={() => void feed.loadMore()}>Carregar mais notificações</Button>}
        </>}
    </div>
  </div>
}
