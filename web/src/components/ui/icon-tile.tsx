import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* Quadro de ícone 38 px (.sport-icon): fundo do app, cantos de 12 px e ícone verde. No escuro, o quadro dourado dos elos. */
export function IconTile({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="icon-tile" className={cn('inline-grid size-[38px] place-items-center rounded-xl bg-app text-brand noite:bg-icon-tile noite:text-icon-tile-ink', className)} {...props} />
}
