import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* Selo verde-claro (.badge): nível no cartão de elo e situação do perfil esportivo. */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="badge" className={cn('inline-flex items-center rounded-[7px] bg-[#005a3610] px-2 py-[5px] text-[10px] font-bold text-brand', className)} {...props} />
}
