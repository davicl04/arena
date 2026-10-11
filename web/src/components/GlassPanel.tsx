import { useId } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { useDialogFocus } from '../hooks/useDialogFocus'

/**
 * Vidro escuro com papel de diálogo.
 * `media`: absoluto sobre a foto de um post (não modal). `screen`: cobre o app inteiro (modal, com Tab preso).
 */
export default function GlassPanel({ variant, label, title, badge, onClose, onBack, backLabel = 'Voltar', closeLabel = 'Fechar', className = '', children }: {
  variant: 'media' | 'screen'
  label: string
  title?: string
  badge?: ReactNode
  onClose: () => void
  onBack?: () => void
  backLabel?: string
  closeLabel?: string
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  const { ref, onKeyDown } = useDialogFocus<HTMLDivElement>(onClose, { trap: variant === 'screen' })
  return <div ref={ref} className={`glass glass-${variant} ${className}`} role="dialog" aria-modal={variant === 'screen' ? true : undefined}
    aria-label={title ? undefined : label} aria-labelledby={title ? titleId : undefined} tabIndex={-1} onKeyDown={onKeyDown}>
    <div className="glass-head">
      {onBack && <button type="button" className="icon-btn" aria-label={backLabel} onClick={onBack}><ArrowLeft size={19} /></button>}
      {title && <h2 id={titleId}>{title}</h2>}
      {badge !== undefined && <span className="glass-badge">{badge}</span>}
      <button type="button" className="icon-btn glass-close" aria-label={closeLabel} onClick={onClose}><X size={19} /></button>
    </div>
    <div className="glass-body">{children}</div>
  </div>
}
