import type { FormResult } from '@/api/results'
import { cn } from '@/lib/utils'

const names: Record<FormResult, string> = { V: 'vitória', E: 'empate', D: 'derrota' }
const tones: Record<FormResult, string> = {
  V: 'bg-mint text-night',
  E: 'bg-white/20 text-white',
  D: 'bg-danger-soft text-[#3b0a12]',
}

/**
 * Forma recente: até 5 quadradinhos do resultado mais antigo (esquerda) ao mais recente (direita). V em menta, E neutro e
 * D em perigo suave; o tênis não tem E. Com menos de 5 partidas, só as que existem. O nome acessível lista os resultados
 * por extenso, na mesma ordem. Sem partidas, nada.
 */
export function RecentForm({ form, className }: { form: readonly FormResult[]; className?: string }) {
  const shown = form.slice(-5)
  if (!shown.length) return null
  return (
    <span role="img" data-slot="recent-form" aria-label={`Últimos resultados: ${shown.map(result => names[result]).join(', ')}`} className={cn('flex gap-[3px]', className)}>
      {shown.map((result, index) => (
        <i key={index} aria-hidden="true" className={cn('grid size-[15px] place-items-center rounded-[4px] text-[8.5px] font-extrabold not-italic', tones[result])}>{result}</i>
      ))}
    </span>
  )
}
