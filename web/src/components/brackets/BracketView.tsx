import { Medal, Trophy } from 'lucide-react'
import type { Bracket, BracketNode, BracketRound } from '@/api/brackets'
import { StateBadge } from '@/components/events/StateBadge'
import { whenText } from '@/data/match'
import { cn } from '@/lib/utils'
import { bracketSummary, competitorName, nodeScore, placementLabel, slotName } from './bracketText'
import { MirrorBracket } from './MirrorBracket'
import { CompetitorMark, CrossTable, RestList, StandingsTable } from './RoundRobinGrid'

/*
 * A árvore (eliminação simples) ou a tabela (todos contra todos) em modo leitura, com a lista dos confrontos por fase e,
 * com o evento encerrado, o campeão e as colocações (no tênis, com o bônus do ranking, RN16). O organizador usa a mesma
 * visão na tela do chaveamento, ligando a troca de lugares da árvore; o atleta inscrito a vê na aba Tabela do evento.
 */

/** Detalhe curto de um confronto na lista: o placar, a data e a quadra, ou "Sem data". */
function nodeMeta(node: BracketNode, sport: Bracket['sport']): { text: string; decided: boolean } | null {
  const match = node.match
  if (!match) return null
  const score = nodeScore(sport, match.score)
  if (score) return { text: score, decided: true }
  if (match.starts_at) return { text: `${whenText(match.starts_at)}${match.court_name ? ` · ${match.court_name}` : ''}`, decided: false }
  return { text: 'Sem data', decided: false }
}

function RoundBlock({ round, bracket }: { round: BracketRound; bracket: Bracket }) {
  return (
    <section aria-label={round.name} className="grid gap-1.5">
      <h3 className="m-0 text-[10.5px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">{round.name}</h3>
      <ul className="m-0 grid list-none gap-0 surface rounded-card p-0 px-3 inset-ring inset-ring-surface-edge">
        {round.nodes.map(node => {
          const [a, b] = node.slots
          const meta = nodeMeta(node, bracket.sport)
          return (
            <li key={node.position} data-node={node.label ?? undefined}
              className="flex min-h-[52px] items-center gap-2.5 border-0 border-b border-solid border-line py-2 last:border-b-0">
              <span className="grid h-5 min-w-8 flex-none place-items-center rounded-md bg-forest px-1.5 font-display text-[9px] font-extrabold text-mint">{node.label ?? '—'}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-[12px] leading-tight wrap-anywhere">
                  {node.bye ? `${slotName(a.kind === 'folga' ? b : a)} avança direto` : <>{slotName(a)} <span className="text-ink-muted">×</span> {slotName(b)}</>}
                </b>
                {node.bye
                  ? <small className="text-[10.5px] text-ink-muted">Folga: não há partida</small>
                  : meta && <small className={cn('text-[10.5px]', meta.decided ? 'font-bold text-brand' : 'text-ink-muted')}>{meta.text}</small>}
              </span>
              {node.match?.awaiting_decision && <StateBadge tone="danger">Decisão pendente</StateBadge>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Campeão e colocações finais (só com o evento encerrado). */
export function FinalBoard({ bracket }: { bracket: Bracket }) {
  const { champion, placements } = bracket
  if (!champion && !placements?.length) return null
  const bonus = bracket.sport === 'tenis'
  return (
    <section aria-label="Classificação final" className="grid gap-2">
      {champion && (
        <div className="flex items-center gap-3 rounded-card bg-forest p-3.5 text-white shadow-[inset_0_0_0_2px_#d9a937]">
          <Trophy size={30} color="#d9a937" aria-hidden="true" className="flex-none" />
          <div className="min-w-0 flex-1">
            <span className="block text-[9.5px] font-extrabold tracking-[0.1em] text-mint uppercase">Campeão</span>
            <b className="block font-display text-[16px] leading-tight wrap-anywhere">{competitorName(champion)}</b>
          </div>
          <CompetitorMark competitor={champion} size="sm" />
        </div>
      )}
      {placements && placements.length > 0 && (
        <>
          <h3 className="m-0 mt-1 text-[10.5px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">Colocações</h3>
          <ol className="m-0 grid list-none gap-0 surface rounded-card p-0 px-3 inset-ring inset-ring-surface-edge">
            {placements.map(item => (
              <li key={item.competitor.entry_id} className="flex min-h-[48px] items-center gap-2.5 border-0 border-b border-solid border-line py-2 last:border-b-0">
                <span className="grid size-6 flex-none place-items-center rounded-full bg-subtle font-display text-[11px] font-extrabold text-ink">{item.placement}º</span>
                <CompetitorMark competitor={item.competitor} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12px]">{competitorName(item.competitor)}</b>
                  <small className="text-[10.5px] text-ink-muted">{placementLabel(item.placement, bracket.kind)}</small>
                </span>
                {bonus && item.bonus_points > 0 && (
                  <StateBadge tone="open"><Medal aria-hidden="true" />+{item.bonus_points} no ranking</StateBadge>
                )}
              </li>
            ))}
          </ol>
          {bonus && placements.every(item => item.bonus_points === 0) && (
            <p className="m-0 text-[10.5px] leading-normal text-ink-muted">O bônus do ranking do tênis vale com 4 ou mais inscrições confirmadas.</p>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Árvore ou tabela do campeonato. `onPick` e `picked` ligam a troca de lugares da árvore (só o organizador, antes de
 * confirmar); no todos contra todos o sorteio só muda a ordem, sem troca manual.
 */
export function BracketView({ bracket, picked, onPick, busy }: { bracket: Bracket; picked?: number | null; onPick?: (place: number) => void; busy?: boolean }) {
  const elimination = bracket.kind === 'eliminacao_simples'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
      <p className="m-0 text-[11px] leading-normal text-ink-muted">{bracketSummary(bracket)}</p>
      {elimination
        ? <MirrorBracket bracket={bracket} picked={picked} onPick={onPick} busy={busy} list={false} />
        : <>
          <CrossTable bracket={bracket} />
          <RestList bracket={bracket} />
          {bracket.table && bracket.table.length > 0 && (
            <>
              <h3 className="m-0 text-[10.5px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">Classificação</h3>
              <StandingsTable rows={bracket.table} sport={bracket.sport} />
            </>
          )}
        </>}
      <FinalBoard bracket={bracket} />
      {bracket.rounds.map(round => <RoundBlock key={round.number} round={round} bracket={bracket} />)}
    </div>
  )
}

