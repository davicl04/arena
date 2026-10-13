import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Estado vazio (.empty-state, .empty-icon): ícone em quadro verde-claro, título e texto centralizados. */
export function EmptyState({ Icon, title, text, action, className }: {
  Icon: LucideIcon
  title: string
  text: string
  action?: ReactNode
  className?: string
}) {
  return <div data-slot="empty-state" className={cn('px-3 py-8 text-center', className)}>
    <span className="mx-auto mb-3.5 grid size-14 place-items-center rounded-[18px] bg-[#005a3610] text-brand"><Icon size={26} /></span>
    <h2 className="text-[15px] leading-[1.5]">{title}</h2>
    <p className="mx-auto mt-[7px] max-w-[280px] text-[12px] leading-[1.7] text-ink-muted">{text}</p>
    {action}
  </div>
}
