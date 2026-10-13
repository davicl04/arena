import { SlidersHorizontal } from 'lucide-react'
import SportIcon from '@/components/SportIcon'
import type { Sport } from '@/api/client'

/**
 * Cartão Categoria: o ícone da modalidade, o rótulo "CATEGORIA" e o texto da escolha ("Futebol · Society 7×7 · Times").
 * Abre a folha de filtros.
 */
export function CategoryCard({ sport, text, onOpen }: { sport: Sport; text: string; onOpen: () => void }) {
  return (
    <button type="button" data-slot="category-card" aria-haspopup="dialog" onClick={onOpen}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-card border border-solid border-line bg-white px-3 py-2.5 text-left text-ink">
      <span className="grid size-[38px] flex-none place-items-center rounded-[12px] bg-tile"><SportIcon sport={sport} size={24} /></span>
      <span className="min-w-0 flex-1">
        <small className="text-[10px] font-bold tracking-[0.08em] text-ink-muted uppercase">Categoria</small>
        <b className="block truncate text-[13px] text-forest">{text}</b>
      </span>
      <SlidersHorizontal size={18} aria-hidden="true" className="text-ink-muted" />
    </button>
  )
}
