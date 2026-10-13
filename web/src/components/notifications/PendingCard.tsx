import type { ArenaNotification } from '@/api/notifications'
import { Button } from '@/components/ui/button'
import { notificationView, pendingDeadline, pendingView } from '@/data/notifications'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/utils/relativeTime'
import { NotificationLead } from './NotificationLead'

/**
 * Cartão de uma pendência no bloco "Para responder": rótulo curto, texto em negrito, tempo relativo, barra do prazo
 * (verde; âmbar com menos de 25% do tempo ou menos de 3 h) e o botão que leva à tela do aviso, onde a resposta acontece.
 * `now` vem de quem lista (`useNow(60_000)`), para o prazo andar sem um relógio por cartão.
 */
export function PendingCard({ notification, now, busy, isAdmin = false, onOpen }: {
  notification: ArenaNotification
  now: number
  busy: boolean
  isAdmin?: boolean
  onOpen: (notification: ArenaNotification) => void
}) {
  const view = notificationView(notification, { isAdmin })
  const pending = pendingView(notification)
  const deadline = pendingDeadline(notification, now)
  const unread = !notification.read_at
  return <article data-slot="pending-card" data-unread={unread ? '' : undefined} data-warn={deadline.warn ? '' : undefined}
    aria-label={`${pending.label.toLocaleLowerCase('pt-BR')}: ${view.text}`}
    className={cn('grid gap-2.5 rounded-[18px] border border-solid bg-white px-3.5 py-[13px] shadow-[0_6px_18px_#0b22180f]', deadline.warn ? 'border-[#c47a0040]' : 'border-[#005a3621]')}>
    <div className="flex items-start gap-3">
      <NotificationLead view={view} />
      <div className="min-w-0 flex-1">
        <p className={cn('mb-0.5 font-mono text-[9.5px] font-bold tracking-[0.12em]', deadline.warn ? 'text-[#8a5a00]' : 'text-brand')}>
          {pending.label}{unread && <span className="sr-only"> · não lida</span>}
        </p>
        <p className="text-[12.5px] leading-[1.45] font-bold wrap-anywhere text-ink">{view.text}</p>
        <small className="mt-0.5 block text-[10.5px] text-ink-muted"><time dateTime={notification.created_at}>{relativeTime(notification.created_at, now)}</time></small>
      </div>
      {unread && <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-brand" />}
    </div>
    {deadline.remaining !== null && <div aria-hidden="true" className="h-[5px] overflow-hidden rounded-full bg-[#49505714]">
      <span className={cn('block h-full rounded-full', deadline.warn ? 'bg-[#d99400]' : 'bg-[#1f9d57]')} style={{ width: `${Math.round(deadline.remaining * 100)}%` }} />
    </div>}
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-ink-muted">{deadline.left ? <>faltam <b className={cn('font-bold', deadline.warn ? 'text-[#8a5a00]' : 'text-ink')}>{deadline.left}</b></> : 'sem prazo'}</span>
      <Button className="min-h-11 shrink-0 px-3.5" disabled={busy} onClick={() => onOpen(notification)}>{pending.action}</Button>
    </div>
  </article>
}
