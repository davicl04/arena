import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Linha de lista agrupada: botão com chevron quando há ação, estática quando não há. */
export default function ListRow({ Icon, label, value, onClick, tone, disabled }: {
  Icon: LucideIcon
  label: string
  value?: ReactNode
  onClick?: () => void
  tone?: 'danger'
  disabled?: boolean
}) {
  const content = <>
    <span className="row-icon"><Icon size={17} /></span>
    <span className="row-label">{label}</span>
    {value !== undefined && <span className="row-value">{value}</span>}
    {onClick && tone !== 'danger' && <ChevronRight size={16} className="row-chevron" />}
  </>
  const className = `list-row${tone ? ` ${tone}` : ''}`
  return onClick
    ? <button type="button" className={className} disabled={disabled} onClick={onClick}>{content}</button>
    : <div className={`${className} static`}>{content}</div>
}
