import { BadgeCheck, Bell, ChevronRight, Trophy } from 'lucide-react'
import type { ArenaNotification } from '@/api/notifications'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { notificationView } from '@/data/notifications'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/utils/relativeTime'

/**
 * Linha de notificação: escudo do time (iniciais do nome no aviso) ou ícone, texto montado do `payload`, tempo
 * relativo e o ponto de não lida. Tocar marca como lida e, quando há destino, navega.
 */
export function NotificationItem({ notification, busy, isAdmin = false, onOpen }: { notification: ArenaNotification; busy: boolean; isAdmin?: boolean; onOpen: (notification: ArenaNotification) => void }) {
  const view = notificationView(notification, { isAdmin })
  const unread = !notification.read_at
  const interactive = unread || Boolean(view.target)
  const content = <>
    {view.kind === 'team'
      ? <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-tile"><TeamCrest name={view.teamName ?? 'Time'} size="sm" decorative /></span>
      : <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-[#005a3612] text-brand">{view.kind === 'organizer' ? <BadgeCheck size={19} /> : view.kind === 'event' ? <Trophy size={19} /> : <Bell size={19} />}</span>}
    <span className="min-w-0 flex-1">
      <span className={cn('block text-[12px] leading-[1.45] wrap-anywhere', unread ? 'font-bold text-ink' : 'text-ink-muted')}>{view.text}</span>
      <small className="mt-1 text-[10.5px] text-ink-muted">
        <time dateTime={notification.created_at}>{relativeTime(notification.created_at)}</time>
        {unread && <span className="sr-only"> · não lida</span>}
      </small>
    </span>
    {unread && <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-brand" />}
    {view.target && <ChevronRight size={17} className="mt-1 flex-none text-ink-muted" aria-hidden="true" />}
  </>
  const row = 'flex w-full items-start gap-3 border-0 px-3.5 py-3 text-left text-inherit'
  return <li className="[&+&]:border-t [&+&]:border-solid [&+&]:border-line" data-unread={unread ? '' : undefined}>
    {interactive
      ? <button type="button" className={cn(row, unread ? 'bg-[#005a3608] enabled:hover:bg-[#005a360f]' : 'bg-transparent enabled:hover:bg-[#f6f7f9]')} disabled={busy} onClick={() => onOpen(notification)}>{content}</button>
      : <div className={row}>{content}</div>}
  </li>
}
