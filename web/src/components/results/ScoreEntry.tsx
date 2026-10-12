import { useId, useState } from 'react'
import { Flag, Users } from 'lucide-react'
import type { ResultInput, ResultMatch } from '@/api/results'
import type { MatchSideOut, ScoreOut } from '@/api/matches'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { otherSide, viewSide } from './format'
import { sideName, sideOf } from '@/data/match'
import { Stepper } from './Stepper'
import { draftToInput, emptySets, needsTiebreak, reportToDraft, setWinner, showsThirdSet, validateTennisSets } from './tennis'
import type { SetDraft } from './tennis'

/*
 * "Informe o placar" (R4): no futebol, −/+ por lado, com o meu lado à esquerda; no tênis, os sets com o tie-break em 7-6 e
 * o terceiro set (ou o super tie-break combinado) só quando os dois primeiros foram divididos. O tênis confere o placar
 * como o servidor antes de enviar. Os botões são "Revisar elenco" (futebol) e "Enviar placar"; ao corrigir o meu placar
 * entra "Cancelar".
 */
export interface ScoreEntryProps {
  match: ResultMatch
  /** O placar que o meu lado já informou (corrigir o meu). */
  initial?: ScoreOut
  busy: boolean
  error: string
  /** "3/7 estatísticas": o andamento do elenco, só no futebol. */
  summary?: string
  /** Aviso sobre o outro lado ("Ferrugem FC já informou o placar"), sem revelar o placar dele. */
  notice?: string
  onRoster?: () => void
  onCancel?: () => void
  onSubmit: (input: ResultInput) => void
}

export function ScoreEntry({ match, initial, busy, error, summary, notice, onRoster, onCancel, onSubmit }: ScoreEntryProps) {
  const headingId = useId()
  const mySide = viewSide(match)
  const tennis = match.sport === 'tenis'
  const mine = sideOf(match, mySide)
  const theirs = sideOf(match, otherSide(mySide))
  const myName = tennis ? 'Você' : sideName(mine, 'Seu time')
  const theirName = sideName(theirs)
  const [goals, setGoals] = useState<[number, number]>(() => {
    const own = mySide === 'a'
    return initial && !tennis ? (own ? [initial.a, initial.b] : [initial.b, initial.a]) : [0, 0]
  })
  const [sets, setSets] = useState<SetDraft[]>(() => (tennis && initial ? reportToDraft(initial, mySide) : emptySets()))
  const [attempted, setAttempted] = useState(false)
  const superTiebreak = Boolean(match.super_tiebreak)
  const input = tennis ? draftToInput(sets, mySide, superTiebreak) : []
  const problem = tennis ? validateTennisSets(input, superTiebreak) : null

  function submit() {
    if (problem) {
      setAttempted(true)
      return
    }
    onSubmit(tennis ? { sets: input }
      : mySide === 'a' ? { goals_a: goals[0], goals_b: goals[1] } : { goals_a: goals[1], goals_b: goals[0] })
  }
  const patch = (index: number, change: Partial<SetDraft>) =>
    setSets(old => old.map((set, at) => (at === index ? { ...set, ...change } : set)))

  return (
    <section aria-labelledby={headingId} data-slot="score-entry" className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-2">
        <Flag size={16} className="flex-none text-brand" aria-hidden="true" />
        <h3 id={headingId} className="text-[13px]">{initial ? 'Corrigir o meu placar' : 'Informe o placar'}</h3>
        {summary && <span className="ml-auto text-[10.5px] text-ink-muted">{summary}</span>}
      </div>

      {notice && <p className="m-0 text-[11px] leading-normal text-ink-muted">{notice}</p>}

      {tennis ? (
        <div className="grid gap-2" role="group" aria-label="Placar por sets">
          <div className="grid grid-cols-[52px_minmax(0,1fr)_14px_minmax(0,1fr)] items-end gap-1.5 text-[10px] font-bold text-ink-muted">
            <span />
            <span className="truncate text-center">{myName}</span>
            <span />
            <span className="truncate text-center">{theirName}</span>
          </div>
          {sets.slice(0, showsThirdSet(sets) ? 3 : 2).map((set, index) => {
            const number = index + 1
            const isSuper = index === 2 && superTiebreak
            const name = isSuper ? 'super tie-break' : `set ${number}`
            const max = isSuper ? 99 : 7
            return (
              <div key={index} role="group" aria-label={isSuper ? 'Super tie-break' : `Set ${number}`} className="grid gap-1.5">
                <div className="grid grid-cols-[52px_minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-1.5">
                  <span className="text-[11px] leading-tight text-ink-muted">{isSuper ? 'Super tie-break' : `Set ${number}`}</span>
                  <Stepper className="justify-self-center" label={`${isSuper ? 'Pontos' : 'Games'} seus no ${name}`} value={set.mine} max={max} disabled={busy}
                    onChange={value => patch(index, { mine: value })} />
                  <span aria-hidden="true" className="text-center text-ink-muted">–</span>
                  <Stepper className="justify-self-center" label={`${isSuper ? 'Pontos' : 'Games'} de ${theirName} no ${name}`} value={set.theirs} max={max} disabled={busy}
                    onChange={value => patch(index, { theirs: value })} />
                </div>
                {!isSuper && needsTiebreak(set) && (
                  <div className="grid grid-cols-[52px_minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-1.5">
                    <span className="text-[10px] leading-tight text-ink-muted">Tie-break</span>
                    <Stepper className="justify-self-center" label={`Pontos seus no tie-break do set ${number}`} value={set.tbMine} max={99} disabled={busy}
                      onChange={value => patch(index, { tbMine: value })} />
                    <span aria-hidden="true" className="text-center text-ink-muted">–</span>
                    <Stepper className="justify-self-center" label={`Pontos de ${theirName} no tie-break do set ${number}`} value={set.tbTheirs} max={99} disabled={busy}
                      onChange={value => patch(index, { tbTheirs: value })} />
                  </div>
                )}
              </div>
            )
          })}
          {!showsThirdSet(sets) && setWinner(sets[0]) && setWinner(sets[1]) && (
            <p className="m-0 text-[10.5px] leading-normal text-ink-muted">Quem venceu os dois primeiros sets já ganhou a partida.</p>
          )}
          {showsThirdSet(sets) && superTiebreak && (
            <p className="m-0 text-[10.5px] leading-normal text-ink-muted">Os dois primeiros sets ficaram divididos: o desempate é um super tie-break até 10, com 2 de vantagem.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2" role="group" aria-label="Placar em gols">
          <GoalsSide side={mine} name={myName} value={goals[0]} disabled={busy} onChange={value => setGoals(old => [value, old[1]])} />
          <span aria-hidden="true" className="pb-1 font-display text-[20px] font-extrabold text-ink-muted">×</span>
          <GoalsSide side={theirs} name={theirName} value={goals[1]} disabled={busy} onChange={value => setGoals(old => [old[0], value])} />
        </div>
      )}

      <div aria-live="polite">
        {(error || (attempted && problem)) && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{error || problem}</p>}
      </div>
      <div className="flex flex-wrap gap-2 *:flex-1">
        {onRoster && !initial && (
          <Button type="button" variant="secondary" disabled={busy} onClick={onRoster}><Users size={16} aria-hidden="true" />Revisar elenco</Button>
        )}
        {onCancel && <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>}
        <Button type="button" disabled={busy} onClick={submit}>{busy ? 'Enviando…' : initial ? 'Enviar correção' : 'Enviar placar'}</Button>
      </div>
    </section>
  )
}

/** Um lado do placar do futebol: brasão, nome e o contador de gols. */
function GoalsSide({ side, name, value, disabled, onChange }: {
  side: MatchSideOut | undefined
  name: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="grid min-w-0 justify-items-center gap-1.5">
      <TeamCrest name={name} initials={side?.team?.initials} path={side?.team?.crest_url} size="md" decorative />
      <b className="w-full truncate text-center text-[12px]">{name}</b>
      <Stepper size="lg" label={`Gols do ${name}`} value={value} disabled={disabled} onChange={onChange} />
    </div>
  )
}
