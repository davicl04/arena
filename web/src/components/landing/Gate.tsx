import { useEffect } from 'react'
import { Logo } from '@/components/Brand'
import type { GatePhase } from '@/hooks/useGate'

/*
 * Portão entre a landing e a tela de entrada (decorativo, oculto para leitores de tela): duas folhas forest, cada uma
 * com metade do Coliseu na borda interna, deslizam das laterais e se encontram; o selo `arena.` aparece no centro.
 * Com o portão fechado a tela troca, e as folhas se abrem. Enquanto existe, cobre a tela inteira e intercepta o
 * ponteiro, e as teclas sem modificador não agem (nem Tab, nem Enter no "Pular para conteúdo", que fica fora da área
 * inerte); os atalhos do navegador continuam. Só é montado durante a sequência (`useGate`), então não deixa nada
 * focável nem oculto depois. Escuro por design, igual nos dois temas. Animações na seção "Landing (web) · portão" de
 * `ui.css`.
 */
export function Gate({ phase }: { phase: GatePhase }) {
  useEffect(() => {
    const block = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) event.preventDefault()
    }
    window.addEventListener('keydown', block, true)
    return () => window.removeEventListener('keydown', block, true)
  }, [])

  return (
    <div aria-hidden="true" data-gate={phase} className="landing-gate escuro-por-design">
      <div className="landing-gate-leaf landing-gate-leaf-l" />
      <div className="landing-gate-leaf landing-gate-leaf-r" />
      <Logo className="landing-gate-seal text-heading" />
    </div>
  )
}
