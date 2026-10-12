import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const rowClass = 'flex w-full items-center gap-3 rounded-card border-0 bg-white p-2.5 text-left text-inherit shadow-[0_2px_8px_#0000000a]'

/**
 * Linha das filas de quadras e de W.O.: quadro com o ícone, título, linhas de apoio, selo e chevron. Com `onOpen` é um
 * botão que abre a folha; sem ele (fila "Decididas"), um cartão de leitura.
 */
export function TileRow({ Icon, title, lines, badge, onOpen }: {
  Icon: LucideIcon
  title: string
  lines: string[]
  badge?: ReactNode
  onOpen?: () => void
}) {
  const content = <>
    <span className="grid size-12 flex-none place-items-center rounded-xl bg-forest text-mint" aria-hidden="true"><Icon size={21} /></span>
    <span className="grid min-w-0 flex-1 justify-items-start gap-[3px]">
      <b className="max-w-full truncate text-[13px]">{title}</b>
      {lines.map((line, index) => <small key={index} className="max-w-full text-[10.5px] leading-[1.4] text-ink-muted wrap-anywhere">{line}</small>)}
      {badge}
    </span>
    {onOpen && <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden="true" />}
  </>
  return <li>
    {onOpen
      ? <button type="button" className={`${rowClass} hover:bg-[#fbfbfc]`} onClick={onOpen}>{content}</button>
      : <div className={rowClass}>{content}</div>}
  </li>
}
