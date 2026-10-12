import { ArenaMark } from '@/components/Brand'
import { PlacementMeter } from '@/components/arena/PlacementMeter'
import { TierEmblem } from '@/components/arena/TierEmblem'
import type { TierLineView } from './tierLines'

/**
 * Linha do elo (H1) sobre a placa: brasão, nome do elo e "Enfrenta…" (ranqueado); "n/3" tracejado, três
 * barrinhas e "n de 3 partidas · enfrenta qualquer nível" (classificação); Coliseu sem elo (corrida sem marca).
 */
export function TierLine({ view }: { view: TierLineView }) {
  if (view.kind === 'placement')
    return <PlacementMeter played={view.played} required={view.required} title={view.title} hint="enfrenta qualquer nível" />
  return <div data-slot="tier-line" data-kind={view.kind} className="flex min-w-0 items-center gap-2.5 text-left">
    {view.kind === 'ranked'
      ? <TierEmblem tier={view.tier} size="lg" decorative />
      : <span className="grid size-11 flex-none place-items-center rounded-full border-2 border-dashed border-white/35">
        <ArenaMark className="h-[18px] w-6 text-white/55" />
      </span>}
    <div className="min-w-0">
      <b className="block font-display text-[14px] font-bold">{view.kind === 'ranked' && <span className="sr-only">Elo </span>}{view.title}</b>
      <small className="mt-0.5 block text-[10.5px] text-white/65">{view.detail}</small>
    </div>
  </div>
}
