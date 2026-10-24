import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { tiers } from '@/data/arena'
import type { TierKey } from '@/data/arena'

const side = 'inline-flex min-h-9 min-w-9 max-w-[34%] items-center gap-1 rounded-full border-0 bg-white/8 px-2.5 text-[10.5px] font-semibold text-white/80 hover:bg-white/14 focus-visible:outline-mint disabled:opacity-30'

/**
 * Troca de elo no topo da placa contínua: ‹ elo de baixo · brasão, NOME DO ELO e a contagem · elo de cima ›. As setas vão ao
 * vizinho com integrantes (quem chama já pulou os vazios); `null` desabilita. Para cima a partir do Diamante o texto é
 * "Salão" e o botão abre o Salão (`up === 'lendario'`).
 */
export function TierSwitch({ tier, count, noun, down, up, onTier, onHall }: {
  tier: TierKey
  count: number
  /** "12 times", "1 atleta". */
  noun: string
  down: TierKey | null
  up: TierKey | null
  onTier: (tier: TierKey) => void
  onHall: () => void
}) {
  const hall = up === 'lendario' && tier !== 'lendario'
  return (
    <div data-slot="tier-switch" className="relative flex items-center justify-between gap-1.5 px-2.5 pt-2.5 text-white">
      <button type="button" className={side} disabled={!down} aria-label={down ? `Ver elo ${tiers[down].name}` : 'Sem elo abaixo'} onClick={() => down && onTier(down)}>
        <ChevronLeft size={16} aria-hidden="true" />
        {down && <span className="truncate">{tiers[down].name}</span>}
      </button>
      <span className="grid min-w-0 flex-1 justify-items-center text-center">
        <TierEmblem tier={tier} size="md" decorative />
        <b className="max-w-full truncate font-display text-[13px] tracking-[0.06em] uppercase">{tiers[tier].name}</b>
        <small className="max-w-full truncate text-[9.5px] text-white/60">{count} {noun}</small>
      </span>
      <button type="button" className={`${side} justify-end`} disabled={!up}
        aria-label={!up ? 'Sem elo acima' : hall ? 'Abrir o Salão dos Lendários' : `Ver elo ${tiers[up].name}`}
        onClick={() => { if (!up) return; if (hall) onHall(); else onTier(up) }}>
        {up && <span className="truncate">{hall ? 'Salão' : tiers[up].name}</span>}
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
