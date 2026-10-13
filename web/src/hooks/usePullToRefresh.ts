import { useEffect, useRef, useState } from 'react'

/** Distância (px) a partir da qual soltar dispara a atualização. */
export const PULL_THRESHOLD = 64
const MAX_PULL = PULL_THRESHOLD * 1.4
/** Pausa (ms) que separa um gesto de roda do anterior. */
const WHEEL_GAP = 250

/**
 * Puxar para atualizar num contêiner rolável: com a rolagem no topo, arrastar o dedo para baixo (ou girar a roda
 * do mouse para cima) mostra `pull` crescendo; soltar além de `PULL_THRESHOLD` chama `onRefresh`.
 * A roda só conta quando o gesto começa com o contêiner já no topo, para a inércia de uma rolagem não disparar.
 * O gesto não alcança quem usa teclado: ofereça também um botão de atualizar.
 */
export function usePullToRefresh(target: HTMLElement | null, onRefresh: () => void, enabled: boolean) {
  const [pull, setPull] = useState(0)
  const refresh = useRef(onRefresh)
  useEffect(() => { refresh.current = onRefresh }, [onRefresh])

  useEffect(() => {
    if (!target || !enabled) return
    let start: number | null = null
    let distance = 0
    let wheelTimer: ReturnType<typeof setTimeout> | undefined
    let lastWheel = 0
    let wheelFromTop = false
    const set = (value: number) => { distance = value; setPull(value) }
    const finish = () => {
      const done = distance >= PULL_THRESHOLD
      start = null
      set(0)
      if (done) refresh.current()
    }
    const onTouchStart = (event: TouchEvent) => { start = target.scrollTop <= 0 ? event.touches[0].clientY : null }
    const onTouchMove = (event: TouchEvent) => {
      if (start === null) return
      const delta = event.touches[0].clientY - start
      set(delta > 0 && target.scrollTop <= 0 ? Math.min(MAX_PULL, delta / 2) : 0)
    }
    const onTouchEnd = () => { if (start !== null) finish() }
    const onWheel = (event: WheelEvent) => {
      const now = event.timeStamp
      if (now - lastWheel > WHEEL_GAP) wheelFromTop = target.scrollTop <= 0
      lastWheel = now
      if (!wheelFromTop || target.scrollTop > 0 || event.deltaY >= 0) return
      set(Math.min(MAX_PULL, distance - event.deltaY / 4))
      clearTimeout(wheelTimer)
      wheelTimer = setTimeout(finish, WHEEL_GAP)
    }
    target.addEventListener('touchstart', onTouchStart, { passive: true })
    target.addEventListener('touchmove', onTouchMove, { passive: true })
    target.addEventListener('touchend', onTouchEnd)
    target.addEventListener('touchcancel', onTouchEnd)
    target.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      clearTimeout(wheelTimer)
      target.removeEventListener('touchstart', onTouchStart)
      target.removeEventListener('touchmove', onTouchMove)
      target.removeEventListener('touchend', onTouchEnd)
      target.removeEventListener('touchcancel', onTouchEnd)
      target.removeEventListener('wheel', onWheel)
      setPull(0)
    }
  }, [target, enabled])

  return { pull, ready: pull >= PULL_THRESHOLD }
}
