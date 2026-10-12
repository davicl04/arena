import { useId, useState } from 'react'
import { Check } from 'lucide-react'
import type { Position } from '@/api/client'
import { positions } from '@/api/client'
import { contestStat, reviewStat } from '@/api/results'
import type { Lineup, StatField, StatReviewInput } from '@/api/results'
import { textareaClass } from '@/components/organizer/fieldStyles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { SocialPhoto } from '@/components/SocialPhoto'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { positionAbbreviation, positionStat, statFieldLabel, statFields, statSummary } from './format'
import { Segmented, Stepper } from './Stepper'

/*
 * Uma pessoa do elenco no "Revisar elenco": presença, posição e as estatísticas enviadas, com as ações do representante
 * (RN10): revisar as do próprio time, corrigindo o que estiver errado, ou contestar itens do adversário, com motivo (uma
 * vez por estatística). Um item contestado só pontua depois da nova revisão do representante do atleta, que é final.
 */
const stateText = { enviada: 'Enviada', revisada: 'Revisada', contestada: 'Contestada' } as const
const REASON = { min: 5, max: 300 }

const positionItems = positions.map(item => ({ value: item.value, label: positionAbbreviation[item.value], title: item.label }))

export function LineupRow({ matchId, lineup, attendance, onAttendance, onUpdated, onExpired, notify }: {
  matchId: number
  lineup: Lineup
  /** Rascunho da presença deste atleta (só quando o representante registra a presença do próprio lado). */
  attendance?: { present: boolean; position: Position | null }
  onAttendance?: (change: { present: boolean; position: Position | null }) => void
  onUpdated: (lineup: Lineup) => void
  onExpired: () => void
  notify: (text: string) => void
}) {
  const [panel, setPanel] = useState<'review' | 'contest' | null>(null)
  const { user, stat } = lineup
  // Com a presença em edição, quem ainda não foi informado só vira "Jogou" quando é marcado.
  const present = attendance ? (attendance.present ? true : lineup.present === null ? null : false) : lineup.present
  const position = attendance ? attendance.position : lineup.position
  const contested = stat?.contested_at != null
  const label = present === true ? 'Jogou' : present === false ? 'Não jogou' : 'Presença não informada'

  return (
    <li data-slot="lineup-row" data-user={user.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-line py-2.5 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <SocialPhoto path={user.avatar_url} name={user.name} className="size-8 flex-[0_0_32px] text-[10px]" />
        <div className="min-w-0 flex-1">
          <b className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="truncate">{user.name}</span>
            {lineup.guest && <Badge className="flex-none">Avulso</Badge>}
          </b>
          <small className="mt-0.5 truncate text-[10.5px] text-ink-muted">
            {position ? `${positionAbbreviation[position]} · ` : ''}{present === false ? label : `${label} · ${statSummary(lineup)}`}
          </small>
        </div>
        {attendance && onAttendance ? (
          <button
            type="button" role="checkbox" aria-checked={attendance.present} aria-label={`${user.name} jogou`}
            onClick={() => onAttendance({ ...attendance, present: !attendance.present })}
            className={cn('grid size-7 flex-none place-items-center rounded-lg border-[1.5px] border-solid text-[14px] font-bold',
              attendance.present ? 'border-brand bg-brand text-white' : 'border-line-strong bg-white text-transparent')}
          >
            <Check size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {attendance && onAttendance && attendance.present && !lineup.position && (
        <Segmented size="sm" label={`Posição de ${user.name}`} items={positionItems} value={attendance.position}
          onChange={value => onAttendance({ ...attendance, position: value })} />
      )}

      {stat?.state === 'contestada' && (
        <p className="m-0 rounded-field bg-warning-bg p-2 text-[10.5px] leading-normal text-warning">
          {stat.contested_by?.name ?? 'O representante adversário'} contestou{stat.contested_fields?.length ? ` ${stat.contested_fields.map(field => statFieldLabel(field, lineup.position).toLowerCase()).join(', ')}` : ''}
          {stat.contest_reason ? <>: “{stat.contest_reason}”</> : '.'} O item contestado só pontua depois da nova revisão do representante do atleta.
        </p>
      )}
      {stat?.state === 'revisada' && contested && (
        <p className="m-0 text-[10.5px] text-ink-muted">Revisão final depois da contestação.</p>
      )}

      {(stat || lineup.can_review || lineup.can_contest) && !panel && (
        <div className="flex flex-wrap items-center gap-2">
          {stat && <Badge className={cn('flex-none', stat.state === 'contestada' && 'bg-warning-bg text-warning')}>{stateText[stat.state]}</Badge>}
          {lineup.can_review && (
            <Button type="button" variant="secondary" size="compact" onClick={() => setPanel('review')}>
              {stat?.state === 'contestada' ? 'Revisar de novo' : stat?.state === 'revisada' ? 'Rever' : 'Revisar'}
            </Button>
          )}
          {lineup.can_contest && <Button type="button" variant="secondary" size="compact" onClick={() => setPanel('contest')}>Contestar</Button>}
        </div>
      )}
      {panel === 'review' && stat && (
        <ReviewPanel matchId={matchId} lineup={lineup} onClose={() => setPanel(null)}
          onDone={updated => { setPanel(null); onUpdated(updated); notify('Estatísticas revisadas') }} onExpired={onExpired} />
      )}
      {panel === 'contest' && stat && (
        <ContestPanel matchId={matchId} lineup={lineup} onClose={() => setPanel(null)}
          onDone={updated => { setPanel(null); onUpdated(updated); notify('Contestação enviada') }} onExpired={onExpired} />
      )}
    </li>
  )
}

function ReviewPanel({ matchId, lineup, onClose, onDone, onExpired }: {
  matchId: number
  lineup: Lineup
  onClose: () => void
  onDone: (lineup: Lineup) => void
  onExpired: () => void
}) {
  const stat = lineup.stat!
  const [position, setPosition] = useState<Position | null>(lineup.position)
  const [goals, setGoals] = useState(stat.goals ?? 0)
  const [assists, setAssists] = useState(stat.assists ?? 0)
  const [extra, setExtra] = useState(stat.position_stat ?? 0)
  const { busy, error, run } = useSubmit(onExpired)
  const name = lineup.user.name
  const extraLabel = position ? positionStat[position].label : 'Estatística da posição'

  async function approve() {
    // Só o que mudou vai como correção; zero vira campo vazio, que não soma nem tira pontos.
    const changes: StatReviewInput = {}
    if (position && position !== lineup.position) changes.position = position
    if (goals !== (stat.goals ?? 0)) changes.goals = goals || null
    if (assists !== (stat.assists ?? 0)) changes.assists = assists || null
    if (extra !== (stat.position_stat ?? 0)) changes.position_stat = extra || null
    const updated = await run(() => reviewStat(matchId, stat.id, changes), 'Não foi possível revisar as estatísticas.')
    if (updated) onDone(updated)
  }

  return (
    <div role="group" aria-label={`Revisar estatísticas de ${name}`} className="grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-field bg-subtle p-2.5">
      <Segmented size="sm" label={`Posição em que ${name} jogou`} items={positionItems} value={position} onChange={setPosition} />
      <div className="grid gap-1.5">
        {([['Gols', goals, setGoals], ['Assistências', assists, setAssists], [extraLabel, extra, setExtra]] as const).map(([title, value, set]) => (
          <div key={title} className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-[11px] font-semibold">{title}</span>
            <Stepper label={`${title} de ${name}`} value={value} max={50} disabled={busy} onChange={set} />
          </div>
        ))}
      </div>
      {stat.state === 'contestada' && <p className="m-0 text-[10.5px] text-ink-muted">Depois de uma contestação, esta revisão é final.</p>}
      <div aria-live="polite">{error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{error}</p>}</div>
      <div className="flex gap-2 *:flex-1">
        <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="button" size="compact" disabled={busy || !position} onClick={() => void approve()}>{busy ? 'Salvando…' : 'Aprovar'}</Button>
      </div>
    </div>
  )
}

function ContestPanel({ matchId, lineup, onClose, onDone, onExpired }: {
  matchId: number
  lineup: Lineup
  onClose: () => void
  onDone: (lineup: Lineup) => void
  onExpired: () => void
}) {
  const id = useId()
  const stat = lineup.stat!
  const [fields, setFields] = useState<StatField[]>([])
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const { busy, error, run } = useSubmit(onExpired)
  const text = reason.trim()
  const invalid = !fields.length || text.length < REASON.min || text.length > REASON.max
  const toggle = (field: StatField) => setFields(old => (old.includes(field) ? old.filter(item => item !== field) : [...old, field]))

  async function send() {
    setTouched(true)
    if (invalid) return
    const updated = await run(() => contestStat(matchId, stat.id, { fields, reason: text }), 'Não foi possível enviar a contestação.')
    if (updated) onDone(updated)
  }

  return (
    <div role="group" aria-label={`Contestar estatísticas de ${lineup.user.name}`} className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-field bg-subtle p-2.5">
      <fieldset className="m-0 grid gap-1 border-0 p-0">
        <legend className="mb-1 text-[11px] font-bold">O que está errado? <span className="font-normal text-ink-muted">(cada estatística só pode ser contestada uma vez)</span></legend>
        {statFields.map(field => (
          <label key={field} className="m-0 flex min-h-8 items-center gap-2 text-[11.5px] font-medium">
            <input type="checkbox" className="size-4 min-h-0 w-4 flex-none accent-brand" checked={fields.includes(field)} disabled={busy} onChange={() => toggle(field)} />
            {statFieldLabel(field, lineup.position)}: {(field === 'gols' ? stat.goals : field === 'assistencias' ? stat.assists : stat.position_stat) ?? 0}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-reason`} className="m-0 text-[11px] font-bold">Motivo</label>
      <textarea id={`${id}-reason`} rows={2} maxLength={REASON.max} value={reason} disabled={busy} aria-invalid={touched && invalid ? true : undefined}
        placeholder="Ex.: ele não fez dois gols, foi um só." className={textareaClass} onChange={event => setReason(event.target.value)} />
      <small className="flex justify-between text-[10px] text-ink-muted"><span>Mínimo de {REASON.min} caracteres.</span><span aria-hidden="true">{reason.length}/{REASON.max}</span></small>
      <div aria-live="polite">
        {touched && invalid && !error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{fields.length ? 'Conte por que a estatística está errada.' : 'Escolha o que está errado.'}</p>}
        {error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{error}</p>}
      </div>
      <div className="flex gap-2 *:flex-1">
        <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="button" size="compact" disabled={busy} onClick={() => void send()}>{busy ? 'Enviando…' : 'Enviar contestação'}</Button>
      </div>
    </div>
  )
}
