import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* Sobretítulo em caixa alta (.eyebrow): 10 px, negrito, espaçamento 0,1em e cor secundária. `as="span"` dentro de blocos flexíveis. */
export function Eyebrow({ as: Tag = 'p', className, ...props }: HTMLAttributes<HTMLElement> & { as?: 'p' | 'span' }) {
  return <Tag data-slot="eyebrow" className={cn('text-[10px] font-bold tracking-[0.1em] text-ink-muted', className)} {...props} />
}
