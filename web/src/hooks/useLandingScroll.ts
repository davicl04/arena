import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

/** Recebe o progresso (0 a 1) de uma seção presa a cada quadro de rolagem. */
export type ProgressListener = (progress: number) => void

/** Variável CSS com o progresso (0 a 1) que o hook escreve em cada seção presa registrada. */
export const PROGRESS_VAR = '--progresso'

export type LandingScroll = {
  /** "Reduzir movimento" ativo na abertura da landing: sem revelação e sem progresso (as seções ficam estáticas). */
  reducedMotion: boolean
  /**
   * Registra uma seção presa: a cada quadro de rolagem, escreve `--progresso` nela e chama `listener`. Devolve a remoção.
   * Com "reduzir movimento", não registra nada.
   */
  track: (element: HTMLElement, listener?: ProgressListener) => () => void
}

/**
 * Progresso de uma seção presa (alta, com o conteúdo em `position: sticky`): 0 quando o topo dela chega ao topo da
 * janela e 1 quando o fim dela chega ao fim da janela.
 */
export function sectionProgress(rect: Pick<DOMRect, 'top' | 'height'>, viewportHeight: number): number {
  const range = Math.max(1, rect.height - viewportHeight)
  return Math.min(1, Math.max(0, -rect.top / range))
}

/*
 * Rolagem da landing, num hook único:
 * - Revelação: os blocos com `data-reveal` dentro de `rootRef` surgem com fade e deslocamento curto ao entrar na tela.
 *   O hook marca a raiz com `data-revelar` (o CSS só esconde os blocos sob essa marca) e um `IntersectionObserver` marca
 *   cada bloco com `data-revelado` ao aparecer. Sem `IntersectionObserver` ou com "reduzir movimento", nada é marcado
 *   e tudo fica visível de imediato. A ordem do escalonamento vem de `--reveal-ordem` no bloco.
 * - Progresso das seções presas (`track`, ou `useScrollProgress` nas seções): um único ouvinte de rolagem, com o
 *   cálculo agrupado por `requestAnimationFrame`, ligado enquanto houver seção registrada e removido ao sair da landing.
 */
export function useLandingScroll(rootRef: RefObject<HTMLElement | null>): LandingScroll {
  const [reducedMotion] = useState(prefersReducedMotion)
  const tracked = useRef(new Map<HTMLElement, ProgressListener | undefined>())
  const detach = useRef<(() => void) | null>(null)

  const measure = useCallback(() => {
    const viewportHeight = window.innerHeight
    tracked.current.forEach((listener, element) => {
      const progress = sectionProgress(element.getBoundingClientRect(), viewportHeight)
      element.style.setProperty(PROGRESS_VAR, progress.toFixed(4))
      listener?.(progress)
    })
  }, [])

  const attach = useCallback(() => {
    if (detach.current) return
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    detach.current = () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      detach.current = null
    }
  }, [measure])

  const track = useCallback(
    (element: HTMLElement, listener?: ProgressListener) => {
      if (reducedMotion) return () => {}
      const sections = tracked.current
      sections.set(element, listener)
      attach()
      measure()
      return () => {
        sections.delete(element)
        element.style.removeProperty(PROGRESS_VAR)
        if (!sections.size) detach.current?.()
      }
    },
    [attach, measure, reducedMotion],
  )

  // Ao sair da landing, o ouvinte de rolagem sai junto.
  useEffect(() => () => detach.current?.(), [])

  // Antes da pintura, para os blocos fora da tela não aparecerem e sumirem em seguida.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || reducedMotion || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-revelado', '')
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    root.setAttribute('data-revelar', '')
    root.querySelectorAll('[data-reveal]:not([data-revelado])').forEach(block => observer.observe(block))
    return () => {
      observer.disconnect()
      root.removeAttribute('data-revelar')
    }
  }, [rootRef, reducedMotion])

  return useMemo(() => ({ reducedMotion, track }), [reducedMotion, track])
}

/** Rolagem da landing para as seções dela (o `LandingPage` fornece). */
export const LandingScrollContext = createContext<LandingScroll | null>(null)

/**
 * Registra a seção presa `ref` no hook de rolagem da landing: ela recebe `--progresso` (0 a 1) e `onProgress` é
 * chamado a cada quadro de rolagem, sem um segundo ouvinte. Devolve `true` quando o progresso está ativo (`false` com
 * "reduzir movimento" ou fora da landing: a seção mostra a versão estática).
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, onProgress?: ProgressListener): boolean {
  const scroll = useContext(LandingScrollContext)
  const latest = useRef(onProgress)
  useEffect(() => {
    latest.current = onProgress
  })
  useEffect(() => {
    const element = ref.current
    if (!scroll || !element) return
    return scroll.track(element, progress => latest.current?.(progress))
  }, [scroll, ref])
  return Boolean(scroll && !scroll.reducedMotion)
}
