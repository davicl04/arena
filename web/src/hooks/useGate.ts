import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Fase do portão em curso: `closing` (as folhas se fecham em ~0,55 s e ficam fechadas enquanto a tela troca) e
 * `opening` (as folhas se abrem em ~0,85 s). `null`: sem portão.
 */
export type GatePhase = 'closing' | 'opening'

/**
 * Marcos da sequência, em milissegundos desde o clique: a troca de tela acontece com o portão fechado, a abertura
 * começa pouco depois e o portão some ao fim da abertura (sequência de cerca de 2 s). As durações das animações
 * estão na seção "portão" de `ui.css`.
 */
export const GATE_TIMING = { switchAt: 880, openAt: 1160, doneAt: 2100 } as const

/*
 * Sequência do portão por temporizadores (`setTimeout`, que os testes conduzem com temporizadores falsos).
 * `run` ignora pedidos enquanto uma sequência está em curso (cliques repetidos não disparam outra). `cancel`
 * interrompe a sequência (ex.: Voltar do navegador no meio dela). Os temporizadores pendentes são limpos ao desmontar.
 */
export function useGate() {
  const [phase, setPhase] = useState<GatePhase | null>(null)
  const timers = useRef(new Set<number>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((id) => window.clearTimeout(id))
      pending.clear()
    }
  }, [])

  const cancel = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current.clear()
    setPhase(null)
  }, [])

  /** Inicia a sequência e chama `onSwitch` com o portão fechado. Devolve `false` se já havia uma em curso. */
  const run = useCallback((onSwitch: () => void) => {
    if (timers.current.size > 0) return false
    const at = (ms: number, step: () => void) => {
      const id = window.setTimeout(() => {
        timers.current.delete(id)
        step()
      }, ms)
      timers.current.add(id)
    }
    setPhase('closing')
    at(GATE_TIMING.switchAt, onSwitch)
    at(GATE_TIMING.openAt, () => setPhase('opening'))
    at(GATE_TIMING.doneAt, () => setPhase(null))
    return true
  }, [])

  /** Há uma sequência em curso (leitura síncrona, para os manipuladores de evento). */
  const busy = useCallback(() => timers.current.size > 0, [])

  return { phase, run, cancel, busy }
}
