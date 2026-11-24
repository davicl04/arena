/**
 * A pessoa pediu menos movimento (`prefers-reduced-motion: reduce`). Para o que o CSS não alcança (rolagem suave por
 * script, sequências com temporizador). Sem `matchMedia`, vale o comportamento com movimento.
 */
export function prefersReducedMotion(): boolean {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  } catch {
    return false
  }
}
