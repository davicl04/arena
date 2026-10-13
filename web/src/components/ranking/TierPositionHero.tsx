import type { ReactNode } from 'react'
import type { MyRankingLine, RankingKey } from '@/api/results'
import { TierEmblem } from '@/components/arena/TierEmblem'
import type { TierKey } from '@/data/arena'
import { formatMetric, gapText, metricUnit } from './metric'
import { inTier, ofTier, theTier } from './tierText'

function Stat({ children }: { children: ReactNode }) {
  return <div className="min-w-0 rounded-[12px] bg-white/5 px-[9px] py-2 [&_b]:block [&_b]:truncate [&_b]:font-display [&_b]:text-[14px] [&_b]:tabular-nums [&_small]:text-[9.5px] [&_small]:text-white/55">{children}</div>
}

/**
 * Posição do titular no elo dele, no alto da placa contínua: "SUA POSIÇÃO NO DIAMANTE", o número grande ("6º"), "de 12
 * no Diamante" (e o time, no ranking de Times) e três números: a métrica, a distância para o 1º do elo ("7 pts atrás do
 * 1º" ou "Lidera o Diamante") e a vantagem sobre o próximo ("1 pt à frente do 7º" ou "Último do Diamante"). As diferenças
 * são relativas às pessoas, nunca aos cortes dos elos.
 */
export function TierPositionHero({ line, tier, ranking }: { line: MyRankingLine; tier: TierKey; ranking: RankingKey }) {
  const position = line.tier_position
  if (position == null || line.metric_value == null) return null
  const size = line.tier_size ?? position
  const where = inTier(tier)
  return (
    <section data-slot="tier-position" aria-label="Sua posição" className="relative px-4 pt-3.5 pb-2">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-bold tracking-[0.1em] text-mint uppercase">Sua posição {where}</p>
          <div className="mt-2 font-display text-[58px] leading-[0.9] font-extrabold tracking-[-0.04em] tabular-nums">
            {position}<sup className="text-[22px] tracking-normal text-mint">º</sup>
          </div>
          <p className="m-0 mt-1 text-[11px] text-white/65">de {size} {where}{line.team ? ` · ${line.team.name}` : ''}</p>
        </div>
        <TierEmblem tier={tier} size="xl" decorative className="size-[74px]" />
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-1.5">
        <Stat><b>{formatMetric(line.metric_value, ranking)}</b>{' '}<small>{metricUnit(ranking)}</small></Stat>
        <Stat>
          {line.leader_gap == null
            ? <><b>Lidera</b>{' '}<small>{theTier(tier)}</small></>
            : <><b>{gapText(line.leader_gap, ranking)}</b>{' '}<small>atrás do 1º</small></>}
        </Stat>
        <Stat>
          {line.next_gap == null || line.next_tier_position == null
            ? <><b>Último</b>{' '}<small>{ofTier(tier)}</small></>
            : <><b>{gapText(line.next_gap, ranking)}</b>{' '}<small>à frente do {line.next_tier_position}º</small></>}
        </Stat>
      </div>
    </section>
  )
}
