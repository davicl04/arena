import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronRight, CircleCheck } from 'lucide-react'
import { ApiError } from '@/api/client'
import { listEventMatches, scheduleConflict, scheduleMatch } from '@/api/brackets'
import type { EventMatchList, EventMatchRow, ScheduleConflict, ScheduleInput } from '@/api/brackets'
import { getOrganizerEvent } from '@/api/events'
import { StateBadge } from '@/components/events/StateBadge'
import { ScheduleSheet } from '@/components/organizer/ScheduleSheet'
import { rowBadge, rowNames, rowSubtitle } from '@/components/organizer/scheduleRows'
import { TeamMark } from '@/components/match/TeamMark'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { whenText } from '@/data/match'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { plural } from '@/utils/format'

/** Os contadores do alto da lista, na ordem do que o organizador faz primeiro. */
function counters(counts: EventMatchList['counts']): { label: string; value: number; hot?: boolean }[] {
  return [
    { label: 'para agendar', value: counts.to_schedule, hot: true },
    { label: 'para decidir', value: counts.to_decide, hot: true },
    { label: 'agendadas', value: counts.scheduled },
    { label: 'esperando jogo anterior', value: counts.waiting },
    { label: 'encerradas', value: counts.finished },
  ].filter(item => item.value > 0)
}

/** Duas marcas lado a lado: o brasão (ou a foto) de quem joga, ou o escudo tracejado enquanto o lado espera o vencedor. */
function RowMarks({ row }: { row: EventMatchRow }) {
  const [a, b] = ['a', 'b'].map(key => row.card.sides.find(side => side.side === key))
  const ghost = <span aria-hidden="true" className="grid size-[26px] place-items-center rounded-full border border-dashed border-ink-muted/50 text-[11px] font-extrabold text-ink-muted">?</span>
  return (
    <span className="flex flex-none items-center -space-x-1.5" aria-hidden="true">
      {a ? <TeamMark side={a} /> : ghost}
      {b ? <TeamMark side={b} /> : ghost}
    </span>
  )
}

/**
 * Partidas do campeonato (S1), do lado do organizador: a lista dos jogos, com os que estão sem data primeiro, e a folha de
 * agendamento (data, horário livre, quadra). Tocar num jogo sem data (ou agendado, antes do início) abre a folha; um jogo
 * com placar para decidir abre a decisão (D3); os demais abrem a partida. Os jogos que esperam o vencedor de uma fase
 * anterior aparecem como "Vencedor J1" e não podem ser agendados.
 */
export default function EventMatchesPage({ eventId, initialMatchId, onInitialShown, onBack, onOpenMatch, onDecide, onExpired }: {
  eventId: number
  /** Partida cuja folha de agendamento abre junto com a tela (botão "Agendar" da partida). */
  initialMatchId?: number
  onInitialShown?: () => void
  onBack: () => void
  onOpenMatch: (matchId: number) => void
  onDecide: (matchId: number) => void
  onExpired: () => void
}) {
  const loadEvent = useCallback(() => getOrganizerEvent(eventId), [eventId])
  const loadMatches = useCallback(() => listEventMatches(eventId), [eventId])
  const event = useResource(loadEvent, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const matches = useResource(loadMatches, onExpired, { fallback: 'Não foi possível carregar as partidas.' })
  const action = useSubmit(onExpired)
  const [selected, setSelected] = useState<number | null>(initialMatchId ?? null)
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null)
  const [status, setStatus] = useState('')
  const consumed = useRef(false)
  const { setData } = matches

  useEffect(() => {
    if (initialMatchId === undefined || consumed.current) return
    consumed.current = true
    onInitialShown?.()
  }, [initialMatchId, onInitialShown])

  const list = matches.data
  const row = selected !== null ? list?.items.find(item => item.card.id === selected && item.can_schedule) ?? null : null

  function open(item: EventMatchRow) {
    if (item.awaiting_decision) return onDecide(item.card.id)
    if (item.can_schedule) { action.setError(''); setConflict(null); setSelected(item.card.id); return }
    if (item.card.sides.length === 2) onOpenMatch(item.card.id)
  }
  function close() { action.setError(''); setConflict(null); setSelected(null) }

  async function save(input: ScheduleInput) {
    if (!row) return
    setConflict(null)
    let found: ScheduleConflict | null = null
    const saved = await action.run(async () => {
      try {
        return await scheduleMatch(row.card.id, input)
      } catch (cause) {
        found = scheduleConflict(cause)
        throw cause
      }
    }, 'Não foi possível agendar a partida.')
    if (!saved) { setConflict(found); return }
    setSelected(null)
    setStatus(`${saved.label} ${row.card.starts_at ? 'reagendado' : 'agendado'} para ${whenText(saved.card.starts_at)}${saved.card.court ? ` em ${saved.card.court.name}` : ''}. Os dois elencos foram avisados.`)
    try {
      setData(await listEventMatches(eventId))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setData(old => old ? { ...old, items: old.items.map(item => item.card.id === saved.card.id ? saved : item) } : old)
    }
  }

  const eyebrow = event.data?.name ?? 'Organizador'
  const header = (
    <TeamsPlate className="pb-4">
      <DarkTopBar eyebrow={eyebrow} title="Partidas" onBack={onBack} />
      {list && list.counts.total > 0 && (
        <p className="m-0 px-5 pt-1 text-[11px] text-white/70" data-slot="schedule-progress">
          {list.counts.total - list.counts.to_schedule - list.counts.waiting} de {plural(list.counts.total, 'jogo', 'jogos')} com data
        </p>
      )}
    </TeamsPlate>
  )

  if (!list) {
    return <div>
      {header}
      <div className="px-5 pt-4">
        {matches.loading && <p role="status" className="text-[12px] text-ink-muted">Carregando as partidas…</p>}
        {matches.error && <div className={feedbackVariants()} role="alert">{matches.error} <Button variant="text" onClick={matches.reload}>Tentar novamente</Button></div>}
      </div>
    </div>
  }

  const chips = counters(list.counts)
  return <div>
    {header}
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pt-4">
      <div aria-live="polite" className="grid gap-2">
        {status && <p className={cn(feedbackVariants({ tone: 'success' }), 'my-0')} role="status">{status}</p>}
        {action.error && !row && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{action.error}</p>}
      </div>

      {list.items.length === 0
        ? <EmptyState Icon={CalendarDays} title="Nenhuma partida ainda" text="As partidas aparecem quando você confirma o chaveamento do campeonato." className="rounded-card bg-white" />
        : <>
          {chips.length > 0 && (
            <ul aria-label="Resumo das partidas" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {chips.map(item => (
                <li key={item.label} className={cn('rounded-full px-2.5 py-1 text-[10.5px] font-bold', item.hot ? 'bg-warning-bg text-warning' : 'bg-white text-ink-muted')}>
                  <b className="font-display text-[11.5px]">{item.value}</b> {item.label}
                </li>
              ))}
            </ul>
          )}
          {list.counts.to_schedule === 0 && list.counts.to_decide === 0 && list.counts.waiting === 0 && list.counts.scheduled > 0 && (
            <p className="m-0 flex items-start gap-2.5 rounded-card bg-success-bg p-3 text-[11.5px] leading-[1.5] text-ink">
              <CircleCheck size={19} className="mt-px flex-none text-brand" aria-hidden="true" />
              <span><b className="block text-[12.5px]">Tudo agendado</b>Os dois elencos de cada jogo foram avisados nas notificações.</span>
            </p>
          )}
          <ul aria-label="Jogos do campeonato" className="m-0 grid list-none gap-2 p-0">
            {list.items.map(item => {
              const [first, second] = rowNames(item)
              const badge = rowBadge(item)
              const interactive = item.awaiting_decision || item.can_schedule || item.card.sides.length === 2
              const content = (
                <>
                  <span className="grid h-5 min-w-8 flex-none place-items-center rounded-md bg-forest px-1.5 font-display text-[9px] font-extrabold text-mint">{item.label}</span>
                  <RowMarks row={item} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[12.5px] leading-tight wrap-anywhere">{first} <span className="text-ink-muted">×</span> {second}</b>
                    <small className="mt-0.5 block text-[10.5px] leading-snug text-ink-muted">{rowSubtitle(item)}</small>
                  </span>
                  <StateBadge tone={badge.tone}>{badge.label}</StateBadge>
                  {interactive && <ChevronRight size={16} className="flex-none text-ink-muted" aria-hidden="true" />}
                </>
              )
              const frame = 'flex min-h-[60px] w-full items-center gap-2.5 rounded-card border-0 bg-white px-3 py-2.5 text-left text-ink shadow-card'
              return (
                <li key={item.card.id} data-match={item.card.id}>
                  {interactive
                    ? <button type="button" className={cn(frame, 'cursor-pointer enabled:hover:bg-[#f6f7f9]')} onClick={() => open(item)}
                      aria-label={`${item.label}, ${first} contra ${second}. ${rowSubtitle(item)}. ${badge.label}.`}>{content}</button>
                    : <div className={cn(frame, 'opacity-80')}>{content}</div>}
                </li>
              )
            })}
          </ul>
        </>}
    </div>

    {row && (
      <ScheduleSheet row={row} city={event.data?.city ?? null} busy={action.busy} error={action.error} conflict={conflict}
        onSubmit={input => void save(input)} onClose={close} onExpired={onExpired}
        onOpenMatch={row.card.sides.length === 2 ? () => onOpenMatch(row.card.id) : undefined} />
    )}
  </div>
}
