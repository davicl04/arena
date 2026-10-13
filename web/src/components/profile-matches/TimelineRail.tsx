import type { ReactNode } from 'react'
import type { TimelineItem, TimelineSport } from '@/api/profile'
import SportIcon from '@/components/SportIcon'
import { DuelCard } from './DuelCard'
import { RunDuelCard } from './RunDuelCard'
import { groupByMonth, itemSport } from './timelineView'

/** Nó do trilho: círculo branco com o ícone da modalidade, sobre a linha vertical. */
function Node({ sport }: { sport: TimelineSport }) {
  return <span data-slot="timeline-node" className="absolute top-2.5 left-0 grid size-8 place-items-center overflow-hidden rounded-full border border-solid border-line bg-white">
    <SportIcon sport={sport} size={20} />
  </span>
}

/**
 * Trilho vertical único, do mais recente ao mais antigo: separadores por mês e um nó por registro. A partida só é
 * tocável com `onOpenMatch`; corridas nunca são. `first` é o nó antes do primeiro mês (a próxima partida).
 */
export function TimelineRail({ items, own, onOpenMatch, first }: {
  items: readonly TimelineItem[]
  own: boolean
  onOpenMatch?: (matchId: number) => void
  first?: ReactNode
}) {
  return <div data-slot="timeline-rail" className="relative before:absolute before:top-3 before:bottom-3 before:left-[15px] before:w-0.5 before:rounded-full before:bg-line">
    {first && <div className="relative mb-3 pl-11"><span className="absolute top-3.5 left-[11px] size-2.5 rounded-full bg-brand ring-4 ring-app" aria-hidden="true" />{first}</div>}
    {groupByMonth(items).map(group => <section key={group.month} aria-label={group.month}>
      <h3 className="relative m-0 mb-2 pl-11 text-[10.5px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">{group.month}</h3>
      <ol className="m-0 mb-3 grid list-none gap-3 p-0">
        {group.items.map(item => <li key={`${item.kind}-${item.id}`} className="relative pl-11">
          <Node sport={itemSport(item)} />
          {item.kind === 'partida' ? <DuelCard match={item} own={own} onOpen={onOpenMatch} /> : <RunDuelCard run={item} />}
        </li>)}
      </ol>
    </section>)}
  </div>
}
