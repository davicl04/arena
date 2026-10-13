import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Funnel } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { MatchCard } from '@/api/matches'
import { getPlayBoard, normalizeBoard } from '@/api/matchmaking'
import { timelinePath } from '@/api/profile'
import type { TimelineItem } from '@/api/profile'
import { nextScheduledMatch } from '@/components/play/matchView'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { usePagedList } from '@/hooks/usePagedList'
import { useNow } from '@/hooks/useNow'
import { NextMatchNode } from './NextMatchNode'
import { TimelineHeader } from './TimelineHeader'
import { TimelineRail } from './TimelineRail'
import { filterSummary } from './timelineView'
import type { SportFilter } from './timelineView'

function Skeleton() {
  return <div role="status" aria-label="Carregando partidas" className="grid gap-3">
    <span className="sr-only">Carregando partidas…</span>
    {[0, 1, 2].map(index => <div key={index} aria-hidden="true" className="h-[104px] rounded-card bg-subtle motion-safe:animate-pulse" />)}
  </div>
}

/** Próxima partida do titular: a da placa que a página já leu (`matches`) ou, sem ela, uma leitura de `GET /me/play`. */
function useNextMatch(enabled: boolean, matches: readonly MatchCard[] | null | undefined, now: number): MatchCard | null {
  const [fetched, setFetched] = useState<readonly MatchCard[] | null>(null)
  const needsFetch = enabled && matches === undefined
  useEffect(() => {
    if (!needsFetch) return
    let alive = true
    getPlayBoard().then(board => { if (alive) setFetched(normalizeBoard(board).matches) })
      .catch(() => { /* A próxima partida é complementar: sem ela, o trilho só não a mostra. */ })
    return () => { alive = false }
  }, [needsFetch])
  const source = matches === undefined ? fetched : matches
  return useMemo(() => (enabled && source ? nextScheduledMatch(source, now) : null), [enabled, source, now])
}

/**
 * Aba Partidas do perfil: a linha do tempo de partidas e corridas (carreira inteira). No perfil próprio (`own`) abre
 * com a próxima partida e as partidas levam à tela da partida (`onOpenMatch`); no visitado nada é tocável e uma
 * conta que a API recusa (404) mostra o vazio de visitante.
 */
export function MatchTimeline({ userId, own, onOpenMatch, onPlay, matches, onExpired }: {
  userId: number
  own: boolean
  onOpenMatch?: (matchId: number) => void
  /** Abre o Jogar no vazio próprio. */
  onPlay?: () => void
  /** Partidas da placa do Jogar, se a página já a leu; `undefined` lê a placa aqui e `null` indica placa ainda sem leitura. */
  matches?: readonly MatchCard[] | null
  onExpired: () => void
}) {
  const [filter, setFilter] = useState<SportFilter>('todas')
  const list = usePagedList<TimelineItem>(timelinePath(userId, filter === 'todas' ? null : filter), onExpired)
  const now = useNow(60_000, own)
  const next = useNextMatch(own, matches, now)
  const nextShown = own && next && (filter === 'todas' || next.sport === filter) ? next : null
  const notFound = list.error instanceof ApiError && list.error.status === 404
  const filtered = filter !== 'todas'

  if (notFound) return <EmptyState Icon={CalendarDays} title="Nenhuma partida por aqui" text="Quando esta conta jogar ou correr, os registros aparecem nesta linha do tempo." />
  if (list.error) return <p role="alert" className="m-0 py-6 text-center text-[12px] text-error">
    {list.error.message} <Button variant="text" className="inline min-h-11 p-0" onClick={list.reload}>Tentar novamente</Button>
  </p>

  const empty = !list.loading && list.items.length === 0
  if (empty && !filtered && !nextShown) {
    return own
      ? <EmptyState Icon={CalendarDays} title="Sua história em campo começa aqui"
        text="Suas partidas e corridas registradas aparecem nesta linha do tempo, da mais recente para a mais antiga."
        action={onPlay && <Button className="mt-4" onClick={onPlay}>Jogar</Button>} />
      : <EmptyState Icon={CalendarDays} title="Nenhuma partida por aqui" text="Quando esta conta jogar ou correr, os registros aparecem nesta linha do tempo." />
  }
  return <div className="pt-4">
    <TimelineHeader total={list.total} filter={filter} onFilter={setFilter} />
    {list.loading
      ? <Skeleton />
      : <>
        {empty && filtered && <EmptyState Icon={Funnel} title="Nenhum registro neste filtro" text={`Sem registros em ${filterSummary(filter).toLowerCase()}.`}
          action={<Button variant="text" className="mx-auto" onClick={() => setFilter('todas')}>Ver todas as modalidades</Button>} />}
        {(!empty || nextShown) && <TimelineRail items={list.items} own={own} onOpenMatch={own ? onOpenMatch : undefined}
          first={nextShown && onOpenMatch && <NextMatchNode match={nextShown} now={new Date(now)} onOpen={onOpenMatch} />} />}
        {list.moreError && <p role="alert" className="m-0 py-2 text-center text-[11px] text-error">{list.moreError}</p>}
        {list.hasMore && <Button variant="text" className="mx-auto" disabled={list.busy} onClick={() => void list.loadMore()}>{list.busy ? 'Carregando…' : 'Carregar mais'}</Button>}
      </>}
  </div>
}
