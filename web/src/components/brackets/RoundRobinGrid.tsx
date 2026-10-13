import { TeamCrest } from '@/components/arena/TeamCrest'
import { SocialPhoto } from '@/components/SocialPhoto'
import type { Bracket, Competitor, TableRow } from '@/api/brackets'
import { scoreText } from '@/components/results/format'
import { cn } from '@/lib/utils'
import { competitorName, planCompetitors } from './bracketText'

/*
 * Todos contra todos (B3): a tabela cruzada com a rodada de cada confronto (e o placar, quando houver), quem folga em cada
 * rodada e a classificação (3/1/0, saldo e gols pró). Antes de confirmar, o sorteio só muda a ordem das linhas; depois,
 * a classificação anda com os resultados. Tudo sai de `Bracket.rounds` e `Bracket.table`.
 */

/** Marca de um competidor: o escudo do time ou a foto do atleta (tênis), pequena e decorativa (o nome vem ao lado). */
export function CompetitorMark({ competitor, size = 'xs' }: { competitor: Competitor; size?: 'xs' | 'sm' }) {
  if (competitor.kind === 'time' && competitor.team) {
    return <TeamCrest name={competitor.team.name} initials={competitor.team.initials} path={competitor.team.crest_url} size={size} decorative />
  }
  return <SocialPhoto path={competitor.athlete?.avatar_url ?? null} name={competitorName(competitor)} size="comment"
    className={size === 'xs' ? 'size-5 flex-[0_0_20px] text-[8px]' : 'size-[26px] text-[9px]'} />
}

/** Nome curto para a tabela: a primeira palavra do time ou do atleta. */
const shortLabel = (competitor: Competitor) => competitorName(competitor).split(/\s+/)[0]

/** Tabela cruzada: a célula (A, B) é o jogo que reúne os dois, com a rodada ("R2") e o placar. */
export function CrossTable({ bracket }: { bracket: Bracket }) {
  const competitors = planCompetitors(bracket.rounds)
  const cells = new Map<string, { round: number; label: string | null; text: string | null; aIsSideA: boolean }>()
  for (const round of bracket.rounds) {
    for (const node of round.nodes) {
      const [a, b] = node.slots
      if (!a.competitor || !b.competitor) continue
      const score = node.match?.score ?? null
      const sport = bracket.sport === 'tenis' ? 'tenis' : 'futebol'
      cells.set(`${a.competitor.entry_id}:${b.competitor.entry_id}`, { round: round.number, label: node.label, text: score ? scoreText(sport, score, 'a') : null, aIsSideA: true })
      cells.set(`${b.competitor.entry_id}:${a.competitor.entry_id}`, { round: round.number, label: node.label, text: score ? scoreText(sport, score, 'b') : null, aIsSideA: false })
    }
  }
  if (!competitors.length) return null
  return (
    <div role="region" aria-label="Tabela cruzada (role para os lados se não couber)" tabIndex={0}
      className="surface overflow-x-auto rounded-[14px] p-2 inset-ring inset-ring-surface-edge outline-offset-2 focus-visible:outline-3 focus-visible:outline-focus">
      <table className="w-full border-collapse text-[10.5px]">
        <caption className="sr-only">Tabela cruzada: a rodada de cada confronto e, depois do jogo, o placar</caption>
        <thead>
          <tr>
            <th scope="col" className="p-1"><span className="sr-only">{bracket.sport === 'tenis' ? 'Atleta' : 'Time'}</span></th>
            {competitors.map(item => (
              <th key={item.entry_id} scope="col" className="p-1 text-center font-normal">
                <span className="inline-grid justify-items-center"><CompetitorMark competitor={item} /></span>
                <span className="sr-only">{competitorName(item)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competitors.map(row => (
            <tr key={row.entry_id}>
              <th scope="row" className="p-1 text-left font-bold whitespace-nowrap text-ink">
                <span className="inline-flex items-center gap-1"><CompetitorMark competitor={row} /><span title={competitorName(row)}>{shortLabel(row)}</span></span>
              </th>
              {competitors.map(column => {
                if (row.entry_id === column.entry_id) {
                  return <td key={column.entry_id} aria-label="Mesmo competidor" className="border border-solid border-line bg-[repeating-linear-gradient(45deg,var(--color-subtle)_0_4px,var(--color-surface)_4px_8px)]" />
                }
                const cell = cells.get(`${row.entry_id}:${column.entry_id}`)
                return (
                  <td key={column.entry_id} className="min-w-8 border border-solid border-line p-1 text-center">
                    {cell ? (
                      <>
                        <b className="block font-display text-[10px] font-extrabold text-brand">R{cell.round}</b>
                        {cell.text && <span className="block text-[9px] font-bold whitespace-nowrap text-ink">{cell.text}</span>}
                        <span className="sr-only">{`${competitorName(row)} contra ${competitorName(column)}: rodada ${cell.round}${cell.text ? `, placar ${cell.text}` : ''}`}</span>
                      </>
                    ) : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Quem folga em cada rodada (número ímpar de competidores). */
export function RestList({ bracket }: { bracket: Bracket }) {
  const rests = bracket.rounds.filter(round => round.rest)
  if (!rests.length) return null
  return (
    <p className="m-0 text-[11px] leading-normal text-ink-muted">
      <b className="text-ink">Folga por rodada:</b>{' '}
      {rests.map(round => `rodada ${round.number}, ${competitorName(round.rest)}`).join(' · ')}.
    </p>
  )
}

/** Classificação: pontos (3/1/0), saldo e gols pró desempatam. No tênis, os gols são os sets. */
export function StandingsTable({ rows, sport }: { rows: TableRow[]; sport: Bracket['sport'] }) {
  const tennis = sport === 'tenis'
  const unit = tennis ? 'sets' : 'gols'
  const cols = [
    { key: 'played', head: 'J', title: 'Jogos' }, { key: 'wins', head: 'V', title: 'Vitórias' },
    { key: 'draws', head: 'E', title: 'Empates' }, { key: 'losses', head: 'D', title: 'Derrotas' },
    { key: 'goals_for', head: tennis ? 'SP' : 'GP', title: `${tennis ? 'Sets' : 'Gols'} pró` },
    { key: 'goals_against', head: tennis ? 'SC' : 'GC', title: `${tennis ? 'Sets' : 'Gols'} contra` },
    { key: 'goal_difference', head: tennis ? 'SS' : 'SG', title: `Saldo de ${unit}` },
  ] as const
  return (
    <div role="region" aria-label="Classificação (role para os lados se não couber)" tabIndex={0}
      className="surface overflow-x-auto rounded-[14px] inset-ring inset-ring-surface-edge outline-offset-2 focus-visible:outline-3 focus-visible:outline-focus">
      <table className="w-full min-w-[330px] border-collapse text-[11px]">
        <caption className="sr-only">Classificação: vitória vale 3 pontos, empate 1 e derrota 0; saldo, {unit} pró e vitórias desempatam</caption>
        <thead>
          <tr className="text-[9.5px] text-ink-muted">
            <th scope="col" className="w-7 py-2 pl-3 text-left font-bold">#</th>
            <th scope="col" className="py-2 text-left font-bold"><span className="sr-only">{tennis ? 'Atleta' : 'Time'}</span></th>
            {cols.map(col => <th key={col.key} scope="col" className="w-7 py-2 text-center font-bold"><abbr title={col.title} className="no-underline">{col.head}</abbr></th>)}
            <th scope="col" className="w-9 py-2 pr-3 text-center font-bold"><abbr title="Pontos" className="no-underline">Pts</abbr></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.competitor.entry_id} className="border-0 border-t border-solid border-line">
              <td className="py-2 pl-3 font-display font-extrabold text-ink-muted">{row.position}</td>
              <th scope="row" className="py-2 text-left font-bold text-ink">
                <span className="inline-flex max-w-[150px] items-center gap-1.5"><CompetitorMark competitor={row.competitor} /><span className="truncate">{competitorName(row.competitor)}</span></span>
              </th>
              {cols.map(col => <td key={col.key} className={cn('py-2 text-center tabular-nums', col.key === 'goal_difference' && row.goal_difference > 0 && 'text-brand')}>{col.key === 'goal_difference' && row.goal_difference > 0 ? `+${row.goal_difference}` : row[col.key]}</td>)}
              <td className="py-2 pr-3 text-center font-display font-extrabold text-brand tabular-nums">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
