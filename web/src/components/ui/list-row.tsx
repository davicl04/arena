import type { ComponentProps, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Lista agrupada (.list-heading, .list-group, .list-row, .row-icon, .row-label, .row-value, .row-chevron). */

/** Título de grupo (.list-heading). Logo após o cabeçalho da página (`header`), perde a margem superior. */
export function ListHeading({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="list-heading" className={cn('mx-1 mt-5 mb-2 text-[10px] font-bold tracking-[0.1em] text-ink-muted uppercase [header+&]:mt-0', className)} {...props} />
}

/** Cartão branco que agrupa linhas (.list-group). */
export function ListGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="list-group" className={cn('overflow-hidden rounded-card bg-white', className)} {...props} />
}

const row = 'flex min-h-[54px] w-full items-center gap-3 border-0 bg-transparent px-3.5 py-2.5 text-left text-inherit [&+&]:border-t [&+&]:border-line'

/** Linha: botão com chevron quando há ação, estática quando não há. `tone="danger"` para sair/remover. */
export function ListRow({ Icon, label, value, onClick, tone, disabled, className }: {
  Icon: LucideIcon
  label: string
  value?: ReactNode
  onClick?: () => void
  tone?: 'danger'
  disabled?: boolean
  className?: string
}) {
  const danger = tone === 'danger'
  const content = <>
    <span className={cn('grid size-[34px] flex-none place-items-center rounded-[10px]', danger ? 'bg-[#b4231812] text-danger-ink' : 'bg-[#005a3612] text-brand')}><Icon size={17} /></span>
    <span className="min-w-0 flex-1 text-[12px] font-bold">{label}</span>
    {value !== undefined && <span className="max-w-[48%] min-w-0 truncate text-[11px] text-ink-muted">{value}</span>}
    {onClick && !danger && <ChevronRight size={16} className="text-ink-muted" />}
  </>
  const classes = cn(row, danger && 'text-danger-ink', className)
  return onClick
    ? <button type="button" data-slot="list-row" data-tone={tone} className={cn(classes, 'enabled:hover:bg-[#f6f7f9]')} disabled={disabled} onClick={onClick}>{content}</button>
    : <div data-slot="list-row" data-tone={tone} className={classes}>{content}</div>
}
