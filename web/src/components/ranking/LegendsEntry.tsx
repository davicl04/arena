import { ChevronRight } from 'lucide-react'
import type { RankingSubject } from '@/api/results'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { cn } from '@/lib/utils'
import { plural } from '@/utils/format'
import { Subject } from './RankingLine'

/** Primeiro corte do Lendário: 15% dos classificados (⌊7 × 15%⌋ = 1). */
const FIRST_SLOT_AT = 7

/**
 * Entrada do Salão dos Lendários. Com Lendários: cartão escuro com gradiente dourado, o brasão, "SALÃO DOS LENDÁRIOS", a
 * contagem e até 4 escudos ou fotos com "+N"; se o titular é Lendário, o texto vira "Você está no Salão" e o contorno é
 * menta. Sem Lendários (sem vagas ou ninguém com os pontos de Diamante): um cartão discreto explica como as vagas abrem.
 */
export function LegendsEntry({ count, slots, preview, mine, onOpen }: {
  /** Lendários na categoria (`tier_counts.lendario`). */
  count: number
  /** Vagas do Salão (`legend_slots`). */
  slots: number
  /** Até 4 Lendários, em ordem (`legends_preview`). */
  preview: readonly RankingSubject[]
  /** O titular (ou o time selecionado dele) é Lendário. */
  mine: boolean
  onOpen: () => void
}) {
  if (count <= 0) {
    return (
      <div data-slot="legends-empty" className="flex items-center gap-2.5 rounded-card border border-dashed border-[#b8962f66] surface px-3.5 py-3">
        <span aria-hidden="true" className="grid flex-none place-items-center opacity-45 grayscale-[0.6]"><TierEmblem tier="lendario" size="lg" decorative /></span>
        <div className="min-w-0">
          <b className="block font-display text-[12.5px] text-forest noite:text-heading">Nenhum Lendário ainda</b>
          <small className="text-[10.5px] leading-[1.45] text-ink-muted">
            {slots > 0
              ? `${plural(slots, 'vaga', 'vagas')} no topo 15%, para quem tem os pontos de Diamante.`
              : `As vagas abrem com ${FIRST_SLOT_AT} classificados (15%), entre quem tem os pontos de Diamante.`}
          </small>
        </div>
      </div>
    )
  }
  const shown = preview.slice(0, 4)
  const rest = count - shown.length
  return (
    <button type="button" data-slot="legends-entry" onClick={onOpen}
      className={cn('flex w-full min-w-0 items-center gap-3 rounded-[18px] border-0 bg-[linear-gradient(110deg,#2f2a10_0%,var(--color-forest)_65%)] px-3.5 py-3 text-left text-white focus-visible:outline-mint',
        mine ? 'shadow-[inset_0_0_0_2px_var(--color-mint)]' : 'shadow-[inset_0_0_0_1px_#F4DE9A40]')}>
      <TierEmblem tier="lendario" size="xl" decorative className="size-[58px]" />
      <span className="min-w-0 flex-1">
        <small className="text-[9.5px] font-bold tracking-[0.1em] text-legend">SALÃO DOS LENDÁRIOS</small>
        <b className="mt-0.5 block font-display text-[13px]">{mine ? 'Você está no Salão' : plural(count, 'Lendário', 'Lendários')}</b>
        {shown.length > 0 && (
          <span aria-hidden="true" className="mt-1.5 inline-flex items-center">
            {shown.map((subject, index) => (
              <span key={index} className="-ml-[7px] grid first:ml-0 [&>[data-slot=social-photo]]:ring-2 [&>[data-slot=social-photo]]:ring-forest">
                <Subject subject={subject} />
              </span>
            ))}
            {rest > 0 && <span className="-ml-[7px] grid h-6 min-w-6 place-items-center rounded-full bg-legend px-1 text-[8.5px] font-bold text-[#3a2d05] ring-2 ring-forest">+{rest}</span>}
          </span>
        )}
      </span>
      <ChevronRight size={18} aria-hidden="true" className="text-white/60" />
    </button>
  )
}
