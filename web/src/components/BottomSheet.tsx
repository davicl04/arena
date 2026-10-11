import { useId } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialogFocus } from '../hooks/useDialogFocus'

/** Folha inferior modal posicionada dentro de `.arena-app` (não na viewport). */
export default function BottomSheet({ title, description, onClose, children }: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const { ref: dialog, onKeyDown } = useDialogFocus<HTMLElement>(onClose)
  return <>
    <div className="sheet-scrim" data-testid="sheet-scrim" onClick={onClose} />
    <section ref={dialog} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-btn" type="button" aria-label="Fechar" onClick={onClose}><X size={20} /></button>
      </div>
      {description && <p className="sheet-sub">{description}</p>}
      <div className="sheet-body">{children}</div>
    </section>
  </>
}
