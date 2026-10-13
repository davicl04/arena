import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { CircleCheck, Gavel, Info, Pencil, UserX } from 'lucide-react'
import { JUSTIFICATION_MAX, JUSTIFICATION_MIN } from '@/api/brackets'
import type { ResultDecisionInput } from '@/api/brackets'
import type { MatchDetail, ScoreOut, Side } from '@/api/matches'
import { TeamMark } from '@/components/match/TeamMark'
import { scoreText, walkoverScoreText } from '@/components/results/format'
import { Stepper } from '@/components/results/Stepper'
import { TennisSets } from '@/components/results/TennisSets'
import { draftToInput, emptySets, validateTennisSets } from '@/components/results/tennis'
import type { SetDraft } from '@/components/results/tennis'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { sideName, sideOf } from '@/data/match'
import { cn } from '@/lib/utils'

type Mode = 'a' | 'b' | 'outro' | 'wo'

/** O placar informado por um lado, no formato do corpo da decisão. */
function reportToInput(sport: MatchDetail['sport'], score: ScoreOut): NonNullable<ResultDecisionInput['score']> {
  if (sport === 'futebol') return { goals_a: score.a, goals_b: score.b }
  return { sets: (score.sets ?? []).map(set => ({ a: set.a, b: set.b, ...(set.tiebreak ? { tiebreak: set.tiebreak } : {}) })) }
}

/** Um lado do placar do futebol: a marca, o nome e o contador de gols. */
function GoalsSide({ match, side, name, value, disabled, onChange }: {
  match: MatchDetail; side: Side; name: string; value: number; disabled: boolean; onChange: (value: number) => void
}) {
  const info = sideOf(match, side)
  return (
    <div className="grid min-w-0 justify-items-center gap-1.5">
      {info && <TeamMark side={info} />}
      <b className="w-full truncate text-center text-[12px]">{name}</b>
      <Stepper size="lg" label={`Gols do ${name}`} value={value} disabled={disabled} onChange={onChange} />
    </div>
  )
}

const choice = 'grid min-h-[78px] min-w-0 content-start justify-items-start gap-0.5 rounded-[14px] border-[1.5px] border-solid border-line-strong bg-white p-2.5 text-left text-ink aria-checked:border-brand aria-checked:bg-[#eaf5ed] aria-checked:shadow-[0_0_0_3px_#8fe0b455]'

/**
 * Escolha de uma opção entre cartões: `radiogroup` com foco só na opção escolhida (ou na primeira) e as setas movendo a
 * escolha e o foco, como os botões de opção nativos (o mesmo padrão do `Segmented`).
 */
function ChoiceGroup<T extends string>({ label, items, value, disabled, onChange }: {
  label: string
  items: readonly { value: T; content: ReactNode }[]
  value: T | null
  disabled: boolean
  onChange: (value: T) => void
}) {
  const active = items.some(item => item.value === value) ? value : items[0]?.value
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const move = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key]
    if (move === undefined || disabled) return
    event.preventDefault()
    const next = (index + move + items.length) % items.length
    onChange(items[next].value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {items.map((item, index) => (
        <button key={item.value} type="button" role="radio" aria-checked={item.value === value} tabIndex={item.value === active ? 0 : -1}
          className={choice} disabled={disabled} onClick={() => onChange(item.value)} onKeyDown={event => onKeyDown(event, index)}>
          {item.content}
        </button>
      ))}
    </div>
  )
}

/**
 * Decisão do organizador (D3): o placar informado por um dos times, outro placar (contadores no futebol, sets no tênis) ou
 * W.O. (o lado ausente), e a justificativa obrigatória (5 a 500 caracteres), registrada e visível aos dois times. O servidor
 * decide se vale: na eliminação não há empate, e a mensagem dele sai como aviso de erro (toast) sem fechar o formulário;
 * `error` só traz o que pertence ao formulário (campos recusados), e a validação local fica junto ao botão.
 */
export function DecisionForm({ match, busy, error, onSubmit }: {
  match: MatchDetail
  busy: boolean
  error: string
  onSubmit: (input: ResultDecisionInput) => void
}) {
  const id = useId()
  const tennis = match.sport === 'tenis'
  const sides = ['a', 'b'] as const
  const nameA = sideName(sideOf(match, 'a'), 'Lado A')
  const nameB = sideName(sideOf(match, 'b'), 'Lado B')
  const names: Record<Side, string> = { a: nameA, b: nameB }
  const reports = match.result?.reports
  const reported = sides.filter(key => reports?.[key]?.score)
  const [mode, setMode] = useState<Mode | null>(reported.length === 1 ? reported[0] : null)
  const [goals, setGoals] = useState<[number, number]>([0, 0])
  const [sets, setSets] = useState<SetDraft[]>(emptySets)
  const [absent, setAbsent] = useState<Side | null>(null)
  const [note, setNote] = useState('')
  const [attempted, setAttempted] = useState(false)
  const superTiebreak = Boolean(match.super_tiebreak)

  const trimmed = note.trim()
  const noteOk = trimmed.length >= JUSTIFICATION_MIN && trimmed.length <= JUSTIFICATION_MAX
  const sets3 = tennis && mode === 'outro' ? draftToInput(sets, 'a', superTiebreak) : []
  const tennisProblem = tennis && mode === 'outro' ? validateTennisSets(sets3, superTiebreak) : null

  let summary = 'decisão'
  let score: ScoreOut | null = null
  if (mode === 'a' || mode === 'b') {
    score = reports?.[mode]?.score ?? null
    summary = score ? scoreText(match.sport, score, 'a') : 'decisão'
  } else if (mode === 'outro') summary = tennis ? 'o placar' : `${goals[0]} × ${goals[1]}`
  else if (mode === 'wo') summary = absent ? `W.O. de ${names[absent]}` : 'W.O.'

  const ready = mode !== null && noteOk && (mode !== 'wo' || absent !== null) && !tennisProblem
  const problem = mode === null ? 'Escolha o placar ou o W.O.'
    : mode === 'wo' && !absent ? 'Escolha o lado que não compareceu.'
    : tennisProblem ?? (!noteOk ? `Escreva a justificativa, de ${JUSTIFICATION_MIN} a ${JUSTIFICATION_MAX} caracteres.` : null)

  function submit() {
    if (busy) return
    if (!ready || mode === null) { setAttempted(true); return }
    const justification = trimmed
    if (mode === 'wo') return onSubmit({ walkover_absent_side: absent, justification })
    if (mode === 'outro') return onSubmit({ score: tennis ? { sets: sets3 } : { goals_a: goals[0], goals_b: goals[1] }, justification })
    if (score) onSubmit({ score: reportToInput(match.sport, score), justification })
  }
  const patch = (index: number, change: Partial<SetDraft>) => setSets(old => old.map((set, at) => (at === index ? { ...set, ...change } : set)))

  return (
    <section aria-labelledby={`${id}-title`} data-slot="decision-form" className="grid gap-3.5">
      <h2 id={`${id}-title`} className="m-0 text-[15px]">Sua decisão</h2>

      <ChoiceGroup<Mode> label="Como decidir o resultado" value={mode} disabled={busy} onChange={setMode} items={[
        ...reported.map(key => {
          const report = reports?.[key]
          return {
            value: key,
            content: <>
              <small className="text-[10px] text-ink-muted">Informado por {names[key]}</small>
              <b className="font-display text-[20px] leading-tight">{report?.score ? scoreText(match.sport, report.score, 'a') : ''}</b>
              {mode === key && <span className="flex items-center gap-1 text-[10.5px] font-bold text-brand"><CircleCheck size={13} aria-hidden="true" />Escolhido</span>}
            </>,
          }
        }),
        {
          value: 'outro' as const,
          content: <>
            <Pencil size={16} className="text-brand" aria-hidden="true" />
            <b className="text-[12.5px]">Outro placar</b>
            <small className="text-[10px] text-ink-muted">{tennis ? 'Informe os sets' : 'Informe os gols'}</small>
          </>,
        },
        {
          value: 'wo' as const,
          content: <>
            <UserX size={16} className="text-brand" aria-hidden="true" />
            <b className="text-[12.5px]">W.O.</b>
            <small className="text-[10px] text-ink-muted">Um lado não compareceu</small>
          </>,
        },
      ]} />

      {mode === 'outro' && (
        tennis
          ? <TennisSets sets={sets} onPatch={patch} mineName={nameA} theirName={nameB} superTiebreak={superTiebreak} disabled={busy} />
          : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 rounded-card bg-white p-3" role="group" aria-label="Placar em gols">
              <GoalsSide match={match} side="a" name={nameA} value={goals[0]} disabled={busy} onChange={value => setGoals(old => [value, old[1]])} />
              <span aria-hidden="true" className="pb-1 font-display text-[20px] font-extrabold text-ink-muted">×</span>
              <GoalsSide match={match} side="b" name={nameB} value={goals[1]} disabled={busy} onChange={value => setGoals(old => [old[0], value])} />
            </div>
          )
      )}

      {mode === 'wo' && (
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[12px] font-bold">Quem não compareceu?</legend>
          <ChoiceGroup<Side> label="Lado ausente" value={absent} disabled={busy} onChange={setAbsent} items={sides.map(key => ({
            value: key,
            content: <>
              <small className="text-[10px] text-ink-muted">Ausente</small>
              <b className="text-[12.5px] wrap-anywhere">{names[key]}</b>
            </>,
          }))} />
          <p className="m-0 text-[10.5px] leading-normal text-ink-muted">
            O lado presente vence por <b>{walkoverScoreText(match.sport)}</b>. Sem restrição automática: o W.O. fica no histórico.
          </p>
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-note`} className="m-0 text-[12px] font-bold">Justificativa (obrigatória)</label>
        <textarea id={`${id}-note`} rows={3} value={note} maxLength={JUSTIFICATION_MAX + 200} disabled={busy}
          placeholder="Ex.: o vídeo mostra o gol antes do apito final." onChange={event => setNote(event.target.value)}
          aria-describedby={`${id}-note-hint`} aria-invalid={attempted && !noteOk ? true : undefined} />
        <small id={`${id}-note-hint`} className="text-[10.5px] leading-normal text-ink-muted">
          Fica registrada e os dois times veem. {trimmed.length}/{JUSTIFICATION_MAX}
        </small>
      </div>

      {error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{error}</p>}
      {attempted && problem && !error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{problem}</p>}

      <Button type="button" className="w-full" disabled={busy} onClick={submit}>
        <Gavel size={16} aria-hidden="true" />{busy ? 'Registrando…' : `Registrar ${summary}`}
      </Button>
      <p className="m-0 flex items-start gap-2 text-[10.5px] leading-normal text-ink-muted">
        <Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
        O resultado entra na tabela e no ranking, a partida é encerrada e os dois elencos são avisados. A decisão fica no histórico da partida.
      </p>
    </section>
  )
}

