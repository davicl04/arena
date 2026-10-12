import type { ReactNode } from 'react'
import type { MyRankingLine, RankingKey, RankingRow } from '@/api/results'
import { PlacementMeter } from '@/components/arena/PlacementMeter'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { Badge } from '@/components/ui/badge'
import { SocialPhoto } from '@/components/SocialPhoto'
import { rankedTier } from '@/components/play/tierLines'
import { tiers } from '@/data/arena'
import { cn } from '@/lib/utils'
import { plural } from '@/utils/format'
import { formatMetric, metricUnit } from './metric'

/*
 * Linhas do Ranking geral: posição, brasão do time ou foto do atleta, nome, campanha, o brasão do elo (todo classificado
 * tem elo; quem está em classificação não aparece na lista) e a métrica. A linha de quem vê fica em destaque; a placa
 * "Sua posição" mostra as linhas do titular (cada time ativo dele, ou ele mesmo), inclusive em classificação.
 */

function Subject({ row }: { row: RankingRow }) {
  if (row.team) return <TeamCrest name={row.team.name} initials={row.team.initials} path={row.team.crest_url} size="sm" decorative />
  return <SocialPhoto path={row.athlete?.avatar_url ?? null} name={row.athlete?.name ?? 'Atleta'} className="size-8 flex-[0_0_32px] text-[10px]" />
}

function Record({ row, ranking }: { row: RankingRow; ranking: RankingKey }) {
  const record = ranking === 'tenis' ? `${row.wins}V ${row.losses}D` : `${row.wins}V ${row.draws}E ${row.losses}D`
  return <>{plural(row.matches_played, 'partida', 'partidas')} · {record}</>
}

export function RankingRows({ items, ranking, onOpenUser }: {
  items: RankingRow[]
  ranking: RankingKey
  onOpenUser?: (userId: number) => void
}) {
  return (
    <ol data-slot="ranking-list" className="m-0 list-none overflow-hidden rounded-card bg-white p-0">
      {items.map(row => {
        const name = row.team?.name ?? row.athlete?.name ?? 'Atleta'
        const open = row.athlete && onOpenUser ? () => onOpenUser(row.athlete!.id) : undefined
        const body = (
          <>
            <span className="grid w-6 flex-none place-items-center font-display text-[13px] font-extrabold tabular-nums">
              <span className="sr-only">Posição </span>{row.rank_position}
            </span>
            <Subject row={row} />
            <span className="min-w-0 flex-1 text-left">
              <b className="block truncate text-[12.5px]">{name}</b>
              <small className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-ink-muted">
                {row.is_mine && <Badge className="flex-none px-1.5 py-0.5 text-[9px]">{row.team ? 'Seu time' : 'Você'}</Badge>}
                <span className="truncate"><Record row={row} ranking={ranking} /></span>
              </small>
            </span>
          </>
        )
        return (
          <li
            key={`${row.rank_position}-${row.team?.id ?? row.athlete?.id}`} data-mine={row.is_mine ? '' : undefined}
            aria-current={row.is_mine ? 'true' : undefined}
            className={cn('flex items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-b-0', row.is_mine && 'bg-[#8fe0b433] shadow-[inset_3px_0_0_var(--color-brand)]')}
          >
            {open
              ? <button type="button" aria-label={`Abrir perfil de ${name}, posição ${row.rank_position}`} onClick={open} className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-inherit">{body}</button>
              : <div className="flex min-w-0 flex-1 items-center gap-2">{body}</div>}
            <span className="flex flex-none items-center gap-2">
              <TierEmblem tier={row.tier} size="md" />
              <span className="grid min-w-9 justify-items-end">
                <b className="font-display text-[14px] font-extrabold tabular-nums">{formatMetric(row.metric_value, ranking)}</b>
                <small className="text-[9.5px] text-ink-muted">{metricUnit(ranking)}</small>
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** "Sua posição": o elo e a colocação, ou a classificação "n de 3", de cada linha do titular neste ranking. */
export function MyRankingPlate({ lines, ranking, empty }: { lines: MyRankingLine[]; ranking: RankingKey; empty?: ReactNode }) {
  if (!lines.length) return empty ? <div data-slot="my-ranking">{empty}</div> : null
  return (
    <section data-slot="my-ranking" aria-label="Sua posição" className="grid gap-3 rounded-card bg-forest p-3.5 text-white">
      <p className="m-0 text-[10px] font-bold tracking-[0.1em] text-mint">SUA POSIÇÃO</p>
      {lines.map((line, index) => {
        const tier = rankedTier(line)
        return (
          <div key={line.team?.id ?? index} className="grid gap-1.5 border-white/15 [&+&]:border-t [&+&]:pt-3">
            {line.team && <small className="text-[10.5px] text-white/65">{line.team.name}</small>}
            {tier ? (
              <div className="flex min-w-0 items-center gap-2.5 text-left">
                <TierEmblem tier={tier} size="lg" decorative />
                <div className="min-w-0">
                  <b className="block font-display text-[14px] font-bold"><span className="sr-only">Elo </span>{tiers[tier].name}</b>
                  <small className="mt-0.5 text-[10.5px] text-white/65">
                    {line.rank_position ? `${line.rank_position}º lugar` : 'Ranqueado'}
                    {line.metric_value != null && ` · ${formatMetric(line.metric_value, ranking)} ${metricUnit(ranking)}`}
                  </small>
                </div>
              </div>
            ) : line.state === 'sem_marca'
              ? <b className="font-display text-[13px]">Sem marca neste ranking</b>
              : <PlacementMeter played={line.played} required={line.required} title="Em classificação" />}
          </div>
        )
      })}
    </section>
  )
}
