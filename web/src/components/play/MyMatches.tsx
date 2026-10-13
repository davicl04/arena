import { useId, useState } from 'react'
import { ChevronRight, Swords } from 'lucide-react'
import { MY_MATCHES_HISTORY_PATH } from '@/api/matchmaking'
import type { MatchCard } from '@/api/matches'
import { StateBadge } from '@/components/events/StateBadge'
import { Card } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'
import { usePagedList } from '@/hooks/usePagedList'
import { SideMark } from './SideBadge'
import { matchPhases } from '@/data/match'
import { matchDetail, matchTitle } from './matchView'

type Scope = 'proximas' | 'historico'
const scopes = [{ value: 'proximas' as const, label: 'Próximas' }, { value: 'historico' as const, label: 'Histórico' }]

/** Cartão de uma partida nas listas da placa: os dois lados, o título, quando e onde, e a fase. Leva à tela da partida. */
export function MatchRow({ card, onOpen }: { card: MatchCard; onOpen: (matchId: number) => void }) {
  const phase = matchPhases[card.phase]
  const mine = card.sides.find(side => side.side === card.my_side) ?? card.sides[0]
  const other = card.sides.find(side => side !== mine)
  return <button type="button" data-slot="match-row" data-phase={card.phase} onClick={() => onOpen(card.id)}
    className="flex min-h-[64px] w-full items-center gap-3 border-0 bg-transparent px-0 py-2.5 text-left text-inherit [&+&]:border-t [&+&]:border-solid [&+&]:border-line">
    <span className="flex flex-none -space-x-2" aria-hidden="true">
      <SideMark side={mine} className="relative z-1 ring-2 ring-white" />
      <SideMark side={other} />
    </span>
    <span className="min-w-0 flex-1">
      <b className="block text-[12.5px] wrap-anywhere">{matchTitle(card)}</b>
      <small className="mt-0.5 text-[10.5px] leading-normal wrap-anywhere text-ink-muted">{matchDetail(card)}</small>
      <span className="mt-1 flex flex-wrap items-center gap-1">
        <StateBadge tone={phase?.tone ?? 'closed'}>{phase?.label ?? card.phase}</StateBadge>
        {card.needs_my_action && <StateBadge tone="pending">Sua vez</StateBadge>}
      </span>
    </span>
    <ChevronRight size={18} aria-hidden="true" className="text-ink-muted" />
  </button>
}

function History({ sport, onOpen, onExpired }: { sport: MatchCard['sport']; onOpen: (matchId: number) => void; onExpired: () => void }) {
  const list = usePagedList<MatchCard>(MY_MATCHES_HISTORY_PATH, onExpired)
  const items = list.items.filter(card => card.sport === sport)
  if (list.loading) return <p role="status" className="m-0 py-4 text-center text-[11.5px] text-ink-muted">Carregando o histórico…</p>
  if (list.error) return <LoadError size="section" text={list.error.message} cause={list.error} onRetry={list.reload} />
  return <>
    {items.length
      ? items.map(card => <MatchRow key={card.id} card={card} onOpen={onOpen} />)
      : <p className="m-0 py-4 text-center text-[11.5px] leading-normal text-ink-muted">Suas partidas encerradas, sem resultado ou canceladas aparecem aqui.</p>}
    {list.moreError && <p role="alert" className="m-0 py-2 text-center text-[11px] text-error">{list.moreError}</p>}
    {list.hasMore && <Button variant="text" className="mx-auto" disabled={list.busy} onClick={() => void list.loadMore()}>{list.busy ? 'Carregando…' : 'Carregar mais'}</Button>}
  </>
}

/**
 * Minhas partidas (Próximas | Histórico). Próximas é o que a placa já leu (`GET /me/play`: combinando, agendada e
 * resultado em aberto); o Histórico lê `GET /me/matches?scope=historico` só quando é aberto. Cada cartão leva à partida.
 */
export function MyMatches({ sport, upcoming, onOpen, onExpired }: {
  sport: MatchCard['sport']
  upcoming: MatchCard[]
  onOpen: (matchId: number) => void
  onExpired: () => void
}) {
  const ids = useId()
  const [scope, setScope] = useState<Scope>('proximas')
  const shown = upcoming.filter(card => card.sport === sport)
  return <section aria-labelledby={`${ids}-title`} className="px-5">
    <SectionTitle className="mt-[22px] mb-2.5" title={<span id={`${ids}-title`}>Minhas partidas</span>} />
    <Tabs variant="track" items={scopes} value={scope} onChange={setScope} label="Minhas partidas" idPrefix={`${ids}-tab-`} controls={`${ids}-panel`} className="mb-2 px-1" />
    <Card id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${scope}`} className="px-3.5 py-1 shadow-card">
      {scope === 'proximas'
        ? shown.length
          ? shown.map(card => <MatchRow key={card.id} card={card} onOpen={onOpen} />)
          : <p className="m-0 flex items-center justify-center gap-2 py-5 text-center text-[11.5px] leading-normal text-ink-muted">
            <Swords size={16} aria-hidden="true" className="flex-none" />Nenhuma partida em andamento. Encontre um adversário para começar.
          </p>
        : <History sport={sport} onOpen={onOpen} onExpired={onExpired} />}
    </Card>
  </section>
}
