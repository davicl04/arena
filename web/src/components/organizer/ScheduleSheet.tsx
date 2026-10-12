import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarCheck, ExternalLink, Info, TriangleAlert } from 'lucide-react'
import type { City } from '@/api/client'
import type { EventMatchRow, ScheduleConflict, ScheduleInput } from '@/api/brackets'
import type { CourtOut } from '@/api/matches'
import { CourtPicker } from '@/components/match/CourtPicker'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'
import { TimeField } from '@/components/ui/time-field'
import { whenText } from '@/data/match'
import { cn } from '@/lib/utils'
import { combineDateTime, splitDateTime, toDateKey } from '@/utils/dateKey'
import { rowNames } from './scheduleRows'
import { SCHEDULE_DAYS_AHEAD, scheduleError, scheduleInput } from './scheduleRules'

const lbl = 'm-0 text-[12px] font-bold'

/**
 * Folha "Agendar" de uma partida do campeonato (S1): Date Picker, horário livre digitado, quadra do catálogo da cidade do
 * evento ou "Sugerir outra quadra" (fica em revisão) e salvar. O `409` de conflito (a mesma quadra ou o mesmo time a menos de
 * 2 h) aparece aqui, com o jogo que conflita, e a folha continua aberta para escolher outro horário ou outra quadra.
 */
export function ScheduleSheet({ row, city, busy, error, conflict, onSubmit, onClose, onOpenMatch, onExpired }: {
  row: EventMatchRow
  /** Cidade do evento: a das quadras do catálogo. */
  city: City | null
  busy: boolean
  error: string
  conflict: ScheduleConflict | null
  onSubmit: (input: ScheduleInput) => void
  onClose: () => void
  /** "Abrir partida" (chat e resultado). */
  onOpenMatch?: () => void
  onExpired: () => void
}) {
  const id = useId()
  const { card } = row
  const initial = splitDateTime(card.starts_at)
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [court, setCourt] = useState<CourtOut | null>(card.court && card.court.state !== 'rejeitada' ? card.court : null)
  const [problem, setProblem] = useState('')
  // O que foi enviado por último: com o conflito na tela, o mesmo dia, horário e quadra não se enviam de novo.
  const [sent, setSent] = useState('')
  const [last] = useState(() => toDateKey(new Date(Date.now() + SCHEDULE_DAYS_AHEAD * 86_400_000)))
  const names = rowNames(row)
  const rescheduling = card.starts_at !== null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const issue = scheduleError(date, time, court)
    setProblem(issue ?? '')
    const startsAt = combineDateTime(date, time)
    if (issue || !startsAt || !court) return
    setSent(`${date}|${time}|${court.id}|${court.name}`)
    onSubmit(scheduleInput(startsAt, court))
  }

  const picker = city ? { id: card.id, city, sport: card.sport, format: card.format } : null
  const message = problem || error
  const blocked = conflict !== null && sent === `${date}|${time}|${court?.id}|${court?.name}`

  return (
    <Sheet title={`${rescheduling ? 'Reagendar' : 'Agendar'} ${row.label}`} description={`${names.join(' × ')} · ${row.stage}`} onClose={onClose}>
      <form className="grid gap-3.5 pt-2" onSubmit={submit} noValidate>
        <div className="grid grid-cols-[1fr_8.5rem] gap-2 app-narrow:grid-cols-[1fr_7.5rem]">
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={`${id}-date`} className={lbl}>Data</label>
            <DatePicker id={`${id}-date`} label="Data" value={date} onChange={setDate} disablePast max={last} invalid={Boolean(problem) && !date} />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={`${id}-time`} className={lbl}>Horário</label>
            <TimeField id={`${id}-time`} value={time} onChange={setTime} stepMinutes={1} invalid={Boolean(problem) && !time} aria-describedby={`${id}-time-hint`} />
          </div>
        </div>
        <small id={`${id}-time-hint`} className="-mt-2 text-[10.5px] leading-normal text-ink-muted">Digite o horário de início, ao minuto.</small>

        {picker
          ? <CourtPicker detail={picker} selected={court} onSelect={setCourt} canSuggest deferSuggestion onExpired={onExpired} />
          : <p className="m-0 text-[11.5px] text-ink-muted">Defina a cidade do evento para escolher a quadra.</p>}

        <div aria-live="assertive" className="grid gap-2">
          {conflict && (
            <div role="alert" id={`${id}-conflict`} data-slot="schedule-conflict" className="flex items-start gap-2.5 rounded-[14px] bg-warning-bg p-3">
              <TriangleAlert size={18} className="mt-px flex-none text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-ink">
                <b className="block text-[12px]">{conflict.kind === 'quadra' ? 'Conflito de quadra' : 'Conflito de horário do time'}</b>
                {error}
                <small className="mt-1 block text-[10.5px] text-ink-muted">
                  Em conflito: {conflict.label} · {conflict.stage}{conflict.starts_at ? ` · ${whenText(conflict.starts_at)}` : ''}{conflict.court_name ? ` · ${conflict.court_name}` : ''}
                </small>
              </div>
            </div>
          )}
          {message && !conflict && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{message}</p>}
          {problem && conflict && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{problem}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={busy || blocked} aria-describedby={blocked ? `${id}-conflict` : undefined}>
          <CalendarCheck size={16} aria-hidden="true" />
          {busy ? 'Salvando…' : rescheduling ? 'Salvar alteração' : 'Agendar'}
        </Button>
        <p className="m-0 flex items-start gap-2 text-[10.5px] leading-normal text-ink-muted">
          <Info size={15} className="mt-px flex-none" aria-hidden="true" />
          Os dois elencos são avisados. A reserva da quadra é com o local; o Arena só registra.
        </p>
        {onOpenMatch && (
          <Button type="button" variant="text" className="flex min-h-10 items-center justify-self-start gap-1.5 py-1 no-underline" onClick={onOpenMatch}>
            <ExternalLink size={15} aria-hidden="true" />Abrir partida e chat
          </Button>
        )}
      </form>
    </Sheet>
  )
}

