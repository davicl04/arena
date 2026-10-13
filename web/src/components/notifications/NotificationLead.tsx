import { BadgeCheck, Bell, CalendarClock, ClipboardCheck, Flag, MapPin, Trophy, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TeamCrest } from '@/components/arena/TeamCrest'
import type { NotificationView } from '@/data/notifications'
import { cn } from '@/lib/utils'

/** Ícone dos avisos sem escudo de time: organizador, evento e, na etapa 3, a partida, a agenda, o resultado, o W.O. e as quadras. */
const kindIcons: Record<Exclude<NotificationView['kind'], 'team'>, LucideIcon> = {
  organizer: BadgeCheck, event: Trophy, match: Zap, schedule: CalendarClock, result: ClipboardCheck, walkover: Flag, court: MapPin, other: Bell,
}

/**
 * Quadro à esquerda de uma notificação: o escudo do time (iniciais do nome no aviso) ou o ícone do tipo.
 * `light` é o quadro das listas claras; `dark` é o da placa do Início (ícone menta sobre `forest`).
 */
export function NotificationLead({ view, tone = 'light', className }: { view: NotificationView; tone?: 'light' | 'dark'; className?: string }) {
  const Icon = view.kind === 'team' ? null : kindIcons[view.kind]
  const dark = tone === 'dark'
  const frame = cn('grid flex-none place-items-center', dark ? 'size-[30px] rounded-[10px]' : 'size-[38px] rounded-xl', className)
  return Icon === null
    ? <span className={cn(frame, dark ? 'bg-mint/10' : 'bg-tile')}><TeamCrest name={view.teamName ?? 'Time'} size={dark ? 'xs' : 'sm'} decorative /></span>
    : <span className={cn(frame, dark ? 'bg-mint/10 text-mint' : 'bg-[#005a3612] text-brand')}><Icon size={dark ? 16 : 19} aria-hidden="true" /></span>
}
