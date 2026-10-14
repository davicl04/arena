import { Bell } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Fundo sobre o qual o sino está: barra clara, placa escura (`forest`) ou capa do perfil (vidro, que clareia ao condensar). */
export type NotificationBellTone = 'light' | 'dark' | 'cover'

const countBase = 'pointer-events-none absolute grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] leading-none font-bold tabular-nums ring-2'
const countClass: Record<NotificationBellTone, string> = {
  light: 'top-1.5 right-1 bg-brand text-on-brand ring-app',
  dark: 'top-1 right-0.5 bg-mint text-night ring-forest',
  cover: 'top-1 right-0.5 bg-mint text-night ring-forest group-data-[condensed=true]/topbar:bg-brand group-data-[condensed=true]/topbar:text-on-brand group-data-[condensed=true]/topbar:ring-app',
}
const focusMint = 'focus-visible:outline-mint'

/**
 * Sino das cinco abas raiz: abre a tela de notificações. O número soma as não lidas e os pedidos para seguir ("9+" acima
 * de 9; sem novidades, nenhum contador). O nome acessível traz o total ("Notificações, 5 novas"); o contador é decorativo.
 */
export function NotificationBell({ count, tone, onOpen, className }: { count: number; tone: NotificationBellTone; onOpen: () => void; className?: string }) {
  const label = count > 0 ? `Notificações, ${count} ${count === 1 ? 'nova' : 'novas'}` : 'Notificações'
  const counter = count > 0 && (
    <span aria-hidden="true" data-testid="unread-indicator" className={cn(countBase, countClass[tone])}>{count > 9 ? '9+' : count}</span>
  )
  if (tone === 'cover') {
    return <IconButton tone="cover" aria-label={label} className={cn('relative', focusMint, className)} onClick={onOpen}><Bell size={21} />{counter}</IconButton>
  }
  if (tone === 'dark') {
    // Alvo de 44 px com o círculo de vidro de 40 px das placas, como o chip da cidade do Jogar.
    return <IconButton tone="glass" aria-label={label} className={cn('relative hover:bg-transparent [&:hover>span:first-child]:bg-white/14', focusMint, className)} onClick={onOpen}>
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-white/8"><Bell size={20} /></span>
      {counter}
    </IconButton>
  }
  return <IconButton aria-label={label} className={cn('relative', className)} onClick={onOpen}><Bell size={21} />{counter}</IconButton>
}
