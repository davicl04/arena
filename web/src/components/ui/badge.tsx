import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* Selo verde-claro (.badge): nível no cartão de elo e situação do perfil esportivo. No escuro, dourado dos elos. */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="badge" className={cn('inline-flex items-center rounded-[7px] bg-icon-tile px-2 py-[5px] text-[10px] font-bold text-icon-tile-ink', className)} {...props} />
}
