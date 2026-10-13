import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Borda esmaecida: a próxima linha escondida aparece cortada e apagando na borda (sem interação), com um botão redondo de
 * vidro com a seta e o número (⌃ 3 / ⌄ 4) por cima. O botão revela as linhas escondidas; o nome acessível diz quantas
 * ("Ver 3 times acima"). Sem a linha escondida (ainda não lida), uma linha vazia faz o papel dela.
 */
export function FadeEdge({ side, count, label, row, busy = false, onClick }: {
  side: 'up' | 'down'
  /** Quantas linhas estão escondidas deste lado. */
  count: number
  /** Nome acessível do botão. */
  label: string
  /** A linha escondida (um `RankingLine`), mostrada esmaecida. */
  row?: ReactNode
  busy?: boolean
  onClick: () => void
}) {
  const up = side === 'up'
  return (
    <div data-slot="fade-edge" data-side={side} className="relative h-[34px] overflow-hidden">
      <div aria-hidden="true" inert
        className={cn('pointer-events-none absolute inset-x-0 opacity-50',
          up ? 'bottom-0 mask-[linear-gradient(to_top,#000_0%,transparent_95%)]' : 'top-0 mask-[linear-gradient(to_bottom,#000_0%,transparent_95%)]')}>
        {row
          ? <ol className="m-0 list-none p-0">{row}</ol>
          : <div className="h-[52px] rounded-[14px] border border-solid border-white/7 bg-white/3" />}
      </div>
      <button type="button" aria-label={label} aria-busy={busy || undefined} disabled={busy} onClick={onClick}
        className="absolute top-1/2 left-1/2 inline-flex min-h-8 -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border border-solid border-white/18 bg-[#0b2218e6] py-1 pr-2.5 pl-1.5 text-[11px] text-white shadow-[0_4px_12px_#0006] backdrop-blur-[6px] focus-visible:outline-mint">
        {up ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        <b className="tabular-nums">{count}</b>
      </button>
    </div>
  )
}
