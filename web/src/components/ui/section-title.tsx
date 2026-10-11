import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* Título de seção com ação opcional à direita (.section-title). A ação costuma ser `Button variant="link"`. */
export function SectionTitle({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return <div data-slot="section-title" className={cn('mt-5 mb-[11px] flex items-center justify-between gap-3', className)}>
    <h2 className="text-[16px]">{title}</h2>
    {action}
  </div>
}
