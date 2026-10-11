import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

const focusable = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Foco de diálogo: ao montar, foca `[data-autofocus]` (ou o próprio contêiner); Esc fecha;
 * Tab circula dentro do diálogo quando `trap` está ativo; ao desmontar, devolve o foco ao elemento anterior.
 */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void, { trap = true, restoreFocus = true } = {}) {
  const ref = useRef<T>(null)
  const restore = useRef(restoreFocus)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = ref.current
    const preferred = node?.querySelector<HTMLElement>('[data-autofocus]')
    if (preferred) preferred.focus()
    else node?.focus({ preventScroll: true })
    const shouldRestore = restore.current
    return () => { if (shouldRestore) previous?.focus() }
  }, [])
  function onKeyDown(event: KeyboardEvent<T>) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab' || !trap || !ref.current) return
    // Um diálogo aninhado resolve o próprio Tab; o externo não deve reagir de novo.
    event.stopPropagation()
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(focusable))
    if (!items.length) { event.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === ref.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
  }
  return { ref, onKeyDown }
}
