import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { X } from 'lucide-react'

const focusable = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Folha inferior modal posicionada dentro de `.arena-app` (não na viewport). */
export default function BottomSheet({ title, description, onClose, children }: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = dialog.current
    const preferred = node?.querySelector<HTMLElement>('[data-autofocus]')
    const target = preferred ?? node
    target?.focus()
    return () => { previous?.focus() }
  }, [])
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab' || !dialog.current) return
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(focusable))
    if (!items.length) { event.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialog.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
  }
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
