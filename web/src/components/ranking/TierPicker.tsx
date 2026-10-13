import { Chip } from '@/components/ui/chip'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { rankingTiers, tiers } from '@/data/arena'
import type { TierKey } from '@/data/arena'

/** Faixas que quem ainda não tem elo pode olhar: Bronze a Diamante (o Lendário tem o Salão). */
const pickable = rankingTiers.filter(tier => tier.image !== 'lendario').map(tier => tier.image)

/**
 * Sem elo (classificação, sem marca, sem time ou sem jogos), os chips Bronze · Prata · Ouro · Diamante escolhem qual faixa
 * a placa contínua mostra; Bronze por padrão.
 */
export function TierPicker({ value, onChange }: { value: TierKey; onChange: (tier: TierKey) => void }) {
  return (
    <div className="grid gap-2" data-slot="tier-picker">
      <p className="m-0 text-[11px] leading-normal text-ink-muted">Você ainda não tem elo. Veja quem está em cada faixa:</p>
      <div role="group" aria-label="Elo" className="flex flex-wrap gap-[7px]">
        {pickable.map(tier => (
          <Chip key={tier} aria-pressed={value === tier} onClick={() => onChange(tier)}>
            <span className="grid place-items-center rounded-[5px] bg-forest p-px"><TierEmblem tier={tier} size="xs" decorative /></span>
            {tiers[tier].name}
          </Chip>
        ))}
      </div>
    </div>
  )
}
