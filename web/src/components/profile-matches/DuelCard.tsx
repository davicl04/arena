import { Trophy } from 'lucide-react'
import type { TimelineMatch } from '@/api/profile'
import { StateBadge } from '@/components/events/StateBadge'
import { SideMark } from '@/components/play/SideBadge'
import { sideName } from '@/data/match'
import { cn } from '@/lib/utils'
import {
  asSideOut, formatLabel, isFaded, isWinner, itemWhen, orderedTimelineSides, pointsLabel, resultBadge, scoreCells, scoreSpoken,
  statsText, timelineTitle,
} from './timelineView'

const cardClass = 'block w-full overflow-hidden rounded-card border border-solid border-line bg-white p-0 text-left text-inherit shadow-card'

/**
 * Duelo: a partida como um mini placar claro. Os dois lados em linhas (marca, nome, "você" no lado do titular só no
 * perfil próprio, vencedor em negrito), o resultado do titular no canto, as pílulas de pontos e estatísticas embaixo.
 * Vira botão só com `onOpen` (perfil próprio); cancelada e sem resultado ficam esmaecidas, com "–" no placar.
 */
export function DuelCard({ match, own, onOpen }: { match: TimelineMatch; own: boolean; onOpen?: (matchId: number) => void }) {
  const badge = resultBadge(match)
  const faded = isFaded(match)
  const sides = orderedTimelineSides(match)
  const points = pointsLabel(match.points)
  const stats = statsText(match.stats)
  const body = <>
    {match.event && <div data-slot="duel-event" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 bg-forest px-3 py-1.5 text-[10.5px] font-bold text-white">
      <Trophy size={13} aria-hidden="true" className="flex-none text-mint" />
      <span className="min-w-0 wrap-anywhere">{match.event.name}</span>
      {match.round_label && <span className="font-extrabold tracking-[0.06em] text-mint uppercase">· {match.round_label}</span>}
    </div>}
    <div className={cn('grid gap-2 px-3 py-2.5', faded && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <small className="min-w-0 text-[10.5px] leading-normal wrap-anywhere text-ink-muted">
          {itemWhen(match.occurred_at)} · {formatLabel(match)}
          {match.court && ` · ${match.court.name}`}
        </small>
        <StateBadge tone={badge.tone} className={cn('flex-none', badge.dashed && 'border border-dashed border-line-strong bg-transparent')}>{badge.label}</StateBadge>
      </div>
      <div className="grid gap-1.5">
        {sides.map(side => {
          const winner = isWinner(match, side.side)
          const absent = match.walkover_absent_side === side.side
          const name = sideName(asSideOut(side))
          return <div key={side.side} data-side={side.side} data-winner={winner || undefined} className="flex items-center gap-2">
            <SideMark side={asSideOut(side)} />
            <span className={cn('min-w-0 flex-1 text-[12.5px] leading-tight wrap-anywhere', winner ? 'font-extrabold text-ink' : 'font-medium')}>
              {name}
              {own && side.is_owner && <span className="ml-1.5 rounded-full bg-success-bg px-1.5 py-px align-middle text-[9px] font-extrabold text-brand">você</span>}
            </span>
            {absent
              ? <span className="flex-none rounded-full bg-subtle px-2 py-0.5 text-[10px] font-bold text-ink-muted">Ausente</span>
              : <span aria-hidden="true" className="flex flex-none gap-2.5 font-display text-[15px] leading-none tabular-nums">
                {scoreCells(match, side.side).map((cell, index) => <span key={index} className={cn('min-w-4 text-center', winner ? 'font-extrabold' : 'font-medium text-ink-muted')}>
                  {cell.value}{cell.tiebreak && <sup className="text-[8px]">{cell.tiebreak}</sup>}
                </span>)}
              </span>}
          </div>
        })}
      </div>
      <span className="sr-only">Placar: {scoreSpoken(match)}</span>
      {(points || stats) && <div className="flex flex-wrap items-center gap-1.5">
        {points && <span data-slot="duel-points" className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-extrabold text-brand">
          {points}<span className="sr-only"> pontos</span>
        </span>}
        {stats && <span className="text-[10.5px] text-ink-muted">{stats}</span>}
      </div>}
    </div>
  </>
  if (!onOpen) return <article data-slot="duel-card" data-state={match.state} className={cardClass} aria-label={timelineTitle(match)}>{body}</article>
  return <button type="button" data-slot="duel-card" data-state={match.state} className={cn(cardClass, 'min-h-11')}
    aria-label={`Abrir partida: ${timelineTitle(match)}, ${badge.label}`} onClick={() => onOpen(match.id)}>{body}</button>
}
