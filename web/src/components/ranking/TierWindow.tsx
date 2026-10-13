import type { ReactNode } from 'react'
import type { RankingKey } from '@/api/results'
import { FadeEdge } from './FadeEdge'
import { RankingLine } from './RankingLine'
import type { WindowEntry } from './windowEntries'

/**
 * Janela do elo: as linhas de vidro e, onde há linhas escondidas, a borda esmaecida com o botão redondo. Cada trecho
 * contínuo de linhas é uma lista própria. O botão da borda chama `onExpand` (abre o elo inteiro) ou `onMore` (lê a próxima
 * página do elo já expandido); `busy` o desabilita enquanto a leitura corre.
 */
export function TierWindow({ entries, ranking, noun, busy, onExpand, onMore, onOpenUser }: {
  entries: readonly WindowEntry[]
  ranking: RankingKey
  /** "time"/"times", "atleta"/"atletas" conforme a quantidade. */
  noun: (count: number) => string
  busy: boolean
  onExpand: () => void
  onMore: () => void
  onOpenUser?: (userId: number) => void
}) {
  const blocks: ReactNode[] = []
  let run: ReactNode[] = []
  const flush = (key: string) => {
    if (!run.length) return
    blocks.push(<ol key={key} className="m-0 grid list-none gap-1.5 p-0">{run}</ol>)
    run = []
  }
  entries.forEach((entry, index) => {
    if (entry.type === 'row') {
      run.push(<RankingLine key={`${entry.row.rank_position}-${entry.row.team?.id ?? entry.row.athlete?.id}`} row={entry.row} ranking={ranking} onOpenUser={onOpenUser} />)
      return
    }
    flush(`run-${index}`)
    const label = entry.action === 'more'
      ? `Ver mais ${entry.count} ${noun(entry.count)}`
      : `Ver ${entry.count} ${noun(entry.count)} ${entry.side === 'up' ? 'acima' : 'abaixo'}`
    blocks.push(
      <FadeEdge key={`edge-${index}`} side={entry.side} count={entry.count} label={label} busy={busy}
        row={entry.row ? <RankingLine row={entry.row} ranking={ranking} /> : undefined}
        onClick={entry.action === 'more' ? onMore : onExpand} />,
    )
  })
  flush('run-end')
  return <div data-slot="tier-window" className="relative grid gap-1.5 px-2.5 pt-1">{blocks}</div>
}
