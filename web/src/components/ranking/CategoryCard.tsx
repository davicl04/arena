import { SlidersHorizontal } from 'lucide-react'
import { SeloLadrilho } from '@/components/SportIcon'
import type { Sport } from '@/api/client'
import { cn } from '@/lib/utils'

/**
 * Cartão Categoria: o ícone da modalidade, o rótulo "CATEGORIA" e o texto da escolha ("Futebol · Society 7×7 · Times").
 * Abre a folha de filtros. `wrap` (coluna estreita do computador) deixa o texto quebrar a linha em vez de truncar.
 */
export function CategoryCard({ sport, text, wrap = false, onOpen }: { sport: Sport; text: string; wrap?: boolean; onOpen: () => void }) {
  return (
    <button type="button" data-slot="category-card" aria-haspopup="dialog" onClick={onOpen}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-card border border-solid border-line surface px-3 py-2.5 text-left text-ink">
      <SeloLadrilho sport={sport} size={38} />
      <span className="min-w-0 flex-1">
        <small className="text-[10px] font-bold tracking-[0.08em] text-ink-muted uppercase">Categoria</small>
        <b className={cn('block text-[13px] text-forest noite:text-heading', wrap ? 'text-pretty' : 'truncate')}>{text}</b>
      </span>
      <SlidersHorizontal size={18} aria-hidden="true" className="text-ink-muted" />
    </button>
  )
}
