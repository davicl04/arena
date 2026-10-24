import { Bell, ChevronRight } from 'lucide-react'
import type { ArenaNotification } from '@/api/notifications'
import { Button } from '@/components/ui/button'
import { notificationView, pendingDeadline, pendingTitle, pendingView } from '@/data/notifications'
import { cn } from '@/lib/utils'
import { NotificationLead } from './NotificationLead'

/** Etiqueta do prazo sobre a placa escura: menta, âmbar (urgente) ou neutra (sem prazo). */
function DueTag({ notification, now }: { notification: ArenaNotification; now: number }) {
  const deadline = pendingDeadline(notification, now)
  return <span className={cn('flex-none rounded-full px-[7px] py-[3px] font-mono text-[9.5px] font-bold',
    deadline.left === null ? 'bg-white/7 text-white/65' : deadline.warn ? 'bg-[#ffcf6b26] text-[#ffcf6b]' : 'bg-mint/12 text-mint')}>
    {deadline.left === null ? 'sem prazo' : <><span className="max-[360px]:sr-only">faltam </span>{deadline.left}</>}
  </span>
}

/**
 * Placa "Para responder" do Início: as pendências mais urgentes (até 2) com o prazo, e o link para a tela de
 * notificações no filtro *Para responder*. Tocar numa linha marca como lida e leva à tela do aviso.
 * Sem pendências, não é renderizada (quem usa decide).
 */
export function PendingPlate({ items, total, now, isAdmin = false, busy = false, onOpenItem, onOpenAll }: {
  /** As pendências a mostrar (as 2 mais urgentes). */
  items: readonly ArenaNotification[]
  /** Total de pendências abertas (`pending_count` do resumo). */
  total: number
  now: number
  isAdmin?: boolean
  busy?: boolean
  onOpenItem: (notification: ArenaNotification) => void
  onOpenAll: () => void
}) {
  const shown = items.slice(0, 2)
  return <section aria-labelledby="pending-plate-title" data-slot="pending-plate"
    className="relative mb-1 overflow-hidden rounded-[20px] bg-forest px-3.5 pt-3.5 pb-1.5 text-white">
    <span aria-hidden="true" className="pointer-events-none absolute -right-10 -bottom-[30px] h-[120px] w-[220px] bg-white opacity-[0.07] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
    <div className="relative mb-1 flex items-center justify-between gap-2">
      <h2 id="pending-plate-title" className="flex items-center gap-2 text-[14px] text-white"><Bell size={16} className="text-mint" aria-hidden="true" />Para responder</h2>
      <span className="rounded-full bg-mint px-2 py-0.5 font-mono text-[10.5px] font-bold text-night" aria-label={`${total} ${total === 1 ? 'pendência' : 'pendências'}`}>{total}</span>
    </div>
    <ul className="relative">
      {shown.map(item => {
        const view = notificationView(item, { isAdmin })
        const pending = pendingView(item)
        return <li key={item.id} className="[&+&]:border-t [&+&]:border-solid [&+&]:border-white/8">
          <button type="button" disabled={busy} onClick={() => onOpenItem(item)}
            className="flex min-h-[54px] w-full items-center gap-2.5 border-0 bg-transparent py-2 text-left text-white focus-visible:outline-mint">
            <NotificationLead view={view} tone="dark" />
            <span className="min-w-0 flex-1 text-[12px] leading-[1.35] font-semibold">
              {pendingTitle(pending)}
              <small className="block truncate text-[10.5px] font-normal text-white/55">{pending.secondary}</small>
            </span>
            <DueTag notification={item} now={now} />
            <ChevronRight size={16} className="flex-none text-white/60" aria-hidden="true" />
          </button>
        </li>
      })}
    </ul>
    <Button variant="glass-link" className="relative inline-flex min-h-11 items-center self-start py-0 focus-visible:outline-mint" onClick={onOpenAll}>
      {total > 2 ? `Ver as ${total} pendências` : 'Ver notificações'}
    </Button>
  </section>
}
