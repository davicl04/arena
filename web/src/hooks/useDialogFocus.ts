import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

const focusable = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Foco de diálogo: ao montar, foca `[data-autofocus]` (ou o próprio contêiner); Esc fecha;
 * Tab circula dentro do diálogo quando `trap` está ativo; ao desmontar, devolve o foco ao elemento anterior.
 */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void, { trap = true, restoreFocus = true } = {}) {
  const ref = useRef<T>(null)
  const restore = useRef(restoreFocus)
  // Elemento focado no primeiro render, antes de o diálogo entrar no DOM. Serve de reserva quando o gatilho fica oculto
  // no mesmo commit (pílulas e ••• sobre a foto do post): o navegador tira o foco dele antes de os efeitos rodarem.
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    // Em regra, o elemento focado agora (inclui o foco devolvido por um diálogo que este substituiu). O próprio diálogo
    // não conta: no StrictMode o efeito roda de novo com o foco já dentro dele.
    const node = ref.current
    const current = document.activeElement
    const previous = current instanceof HTMLElement && current !== document.body && !node?.contains(current) ? current : opener
    const preferred = node?.querySelector<HTMLElement>('[data-autofocus]')
    if (preferred) preferred.focus()
    else node?.focus({ preventScroll: true })
    const shouldRestore = restore.current
    return () => { if (shouldRestore) previous?.focus() }
  }, [opener])
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
