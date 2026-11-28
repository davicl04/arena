import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

const focusable = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Para onde devolver o foco ao fechar. Em regra, o próprio elemento anterior. Se ele saiu do documento (o gatilho remontou
 * noutro lugar ao cruzar 768 ou 1024 px com a folha aberta) e tem `data-foco-retorno`, vai para o elemento com a mesma
 * chave que está na tela agora (a barra de inscrição do Evento, a categoria do Ranking). Com o nó ainda no documento, nada
 * muda.
 */
function returnTarget(previous: HTMLElement | null): HTMLElement | null {
  const key = previous?.dataset.focoRetorno
  if (!previous || previous.isConnected || !key) return previous
  return Array.from(document.querySelectorAll<HTMLElement>('[data-foco-retorno]')).find(element => element.dataset.focoRetorno === key) ?? previous
}

/**
 * Foco de diálogo: ao montar, foca `[data-autofocus]` (ou o próprio contêiner); Esc fecha;
 * Tab circula dentro do diálogo quando `trap` está ativo; ao desmontar, devolve o foco ao elemento anterior (returnTarget).
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
    return () => { if (shouldRestore) returnTarget(previous)?.focus() }
  }, [opener])
  // Cruzar 768 px com a sobreposição aberta a remonta noutro lugar da árvore (useOverlayPortal): o nó antigo sai do DOM
  // com o foco, que cai no `body`, e o Esc e o Tab deixariam de ser do diálogo. Quando o nó troca e o foco ficou solto, ele
  // volta para o diálogo novo. Sem troca de nó (o caso normal, inclusive no celular), nada acontece.
  const mounted = useRef<T | null>(null)
  useEffect(() => {
    const node = ref.current
    const active = document.activeElement
    if (node && mounted.current && mounted.current !== node && (!active || active === document.body))
      (node.querySelector<HTMLElement>('[data-autofocus]') ?? node).focus({ preventScroll: true })
    mounted.current = node
  })
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
