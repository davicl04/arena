import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { createRun, getRunRaces, previewRun } from '@/api/runs'
import type { RunCreated, RunInput, RunPreview, RunRace, RunSource } from '@/api/runs'
import { teamButton } from '@/components/teams/styles'
import { IconButton } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { runDistances } from '@/data/arena'
import type { RunDistance } from '@/data/arena'
import { useResource } from '@/hooks/useResource'
import { cn } from '@/lib/utils'
import { toDateKey } from '@/utils/dateKey'
import { PlateChips } from './PlateChips'
import { RunPreviewCard } from './RunPreviewCard'
import { RunRaces } from './RunRaces'
import { RunTimeFields } from './RunTimeFields'
import { MAX_DISTANCE_M, MIN_DISTANCE_M, WINDOW_DAYS, formatKm, formatPace, impactView, paceOf, standardMeters, toSeconds } from './runView'
import type { HmsParts } from './runView'

/** Espera depois da última mudança antes de pedir a prévia (cada toque numa seta não vira uma chamada). */
export const PREVIEW_DELAY_MS = 300

type Choice = RunDistance | 'outra'
const rulerItems: { value: `${RunDistance}` | 'outra'; label: string }[] = [
  ...runDistances.map(item => ({ value: `${item.value}` as `${RunDistance}`, label: item.label })),
  { value: 'outra', label: 'Outra' },
]
const sourceOptions = [
  { value: 'treino' as const, label: 'Treino' },
  { value: 'prova' as const, label: 'Prova do Arena' },
]
const MEASURE_RANGE = 'A distância deve ficar entre 1 km e 100 km.'
const label = 'text-[10px] font-bold tracking-[0.1em] text-white/65 uppercase'

/** O que o servidor recusou, por campo (`422`), mais o que não pertence a um campo. `blocked`: repetir não adianta. */
interface Problems { distance_m?: string; duration_s?: string; date?: string; entry_id?: string; general?: string; blocked: boolean }
/** Resposta da prévia (ou do salvar) para as entradas identificadas por `key`. */
interface Outcome { key: string; preview?: RunPreview; problems?: Problems }

const fieldNames = ['distance_m', 'duration_s', 'date', 'entry_id'] as const
function problemsOf(cause: unknown, fallback: string): Problems {
  if (!(cause instanceof ApiError)) return { general: fallback, blocked: false }
  const problems: Problems = { blocked: cause.status >= 400 && cause.status < 500 }
  const rest: string[] = []
  for (const item of cause.fields) {
    const name = fieldNames.find(field => field === item.field)
    if (name) problems[name] ??= item.message
    else rest.push(item.message)
  }
  if (!cause.fields.length) rest.push(cause.message || fallback)
  if (rest.length) problems.general = rest.join(' ')
  return problems
}

function Problem({ id, children }: { id: string; children?: string }) {
  return <div aria-live="polite">
    {children && <p id={id} className="m-0 mt-1.5 text-center text-[11.5px] leading-normal text-danger-soft">{children}</p>}
  </div>
}

/**
 * Registrar corrida (K2), em tela cheia dentro da moldura do app: régua de distâncias (3, 5, 10, 21, 42 km e "Outra" com
 * metros), tempo em h : min : s com setas, o ritmo ao vivo, Treino | Prova do Arena, a data e a prévia do que a marca faz
 * com o ranking (`POST /me/runs/preview`, a cada mudança, com espera). "Salvar" grava (`POST /me/runs`); o servidor decide
 * tudo e os erros voltam no campo certo (`ApiError.fields`). Esc e "Fechar" saem sem gravar.
 */
export function RunStopwatchDialog({ initialDistance, onClose, onSaved, onFindRaces, onExpired }: {
  initialDistance: RunDistance
  onClose: () => void
  onSaved: (created: RunCreated) => void
  /** Abre a lista de provas (quando não há prova para registrar). */
  onFindRaces?: () => void
  onExpired: () => void
}) {
  const id = useId()
  const popup = useRef<HTMLDivElement>(null)
  // Quem abriu (REGISTRAR ou o "+" do cartão) recebe o foco de volta ao fechar: guardado no primeiro render, antes de o foco entrar no diálogo.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null))
  const [choice, setChoice] = useState<Choice>(initialDistance)
  const [otherMeters, setOtherMeters] = useState('')
  const [time, setTime] = useState<HmsParts>({ h: 0, m: 0, s: 0 })
  const [source, setSource] = useState<RunSource>('treino')
  const [raceId, setRaceId] = useState<number | null>(null)
  const [today] = useState(() => new Date())
  const todayKey = toDateKey(today)
  const firstKey = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - WINDOW_DAYS))
  const [date, setDate] = useState(todayKey)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)

  const races = useResource(getRunRaces, onExpired, { enabled: source === 'prova', fallback: 'Não foi possível carregar suas provas.' })
  const raceList: RunRace[] = races.data?.items ?? []
  const race = raceList.find(item => item.entry_id === raceId)
  const hasRace = Boolean(race)

  const meters = choice === 'outra' ? Number(otherMeters) : standardMeters[choice]
  const metersOk = Number.isInteger(meters) && meters >= MIN_DISTANCE_M && meters <= MAX_DISTANCE_M
  const durationS = toSeconds(time)
  const input = useMemo<RunInput | null>(() => {
    if (!metersOk || durationS <= 0) return null
    if (source === 'treino') return { distance_m: meters, duration_s: durationS, source, date }
    return hasRace ? { distance_m: meters, duration_s: durationS, source, entry_id: raceId } : null
  }, [metersOk, meters, durationS, source, date, hasRace, raceId])
  const key = useMemo(() => JSON.stringify(input), [input])

  useEffect(() => {
    if (!input) return
    let current = true
    const timer = window.setTimeout(() => {
      previewRun(input).then(preview => { if (current) setOutcome({ key, preview }) }, (cause: unknown) => {
        if (!current) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setOutcome({ key, problems: problemsOf(cause, 'Não foi possível calcular a prévia.') })
      })
    }, PREVIEW_DELAY_MS)
    return () => { current = false; window.clearTimeout(timer) }
  }, [input, key, onExpired])

  async function save() {
    if (!input || busy) return
    setBusy(true)
    try {
      onSaved(await createRun(input))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setOutcome(old => ({ key, preview: old?.key === key ? old.preview : undefined, problems: problemsOf(cause, 'Não foi possível salvar a corrida.') }))
    } finally {
      setBusy(false)
    }
  }

  const current = input && outcome?.key === key ? outcome : null
  const fresh = Boolean(current)
  const problems = current?.problems
  const preview = input ? outcome?.preview : undefined
  const pace = (fresh && preview ? preview.pace_s_per_km : null) ?? (metersOk ? paceOf(durationS, meters) : null)
  const distanceText = preview
    ? (preview.standard_distance_km ? `${preview.standard_distance_km} km` : formatKm(preview.distance_m))
    : ''
  const view = preview ? impactView(preview.impact, distanceText) : null
  const distanceProblem = choice === 'outra' && otherMeters !== '' && !metersOk ? MEASURE_RANGE : problems?.distance_m
  const hint = input ? (problems ? '' : 'Calculando o efeito no seu ranking…')
    : durationS <= 0 ? 'Informe o tempo para ver o que ele muda no seu ranking.'
      : !metersOk ? 'Informe a distância em metros.'
        : 'Escolha a prova para ver o efeito no seu ranking.'
  const ids = { time: `${id}-time`, distance: `${id}-distance`, date: `${id}-date`, races: `${id}-races`, meters: `${id}-meters` }

  return <Dialog open onOpenChange={next => { if (!next && !busy) onClose() }}>
    <DialogContent ref={popup} initialFocus={popup} finalFocus={() => (opener?.isConnected ? opener : true)} showCloseButton={false} data-testid="run-dialog"
      className="inset-0 h-full w-full max-w-none translate-none gap-0 overflow-x-hidden overflow-y-auto rounded-none bg-[radial-gradient(120%_60%_at_50%_0%,#163f2c_0%,var(--color-night)_65%)] p-0 text-white shadow-none sm:max-w-none">
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-2 pt-2">
          <IconButton type="button" tone="glass" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></IconButton>
          <DialogTitle className="text-[15px] text-white">Registrar corrida</DialogTitle>
          <span aria-hidden="true" className="w-11" />
        </header>
        <DialogDescription className="sr-only">
          Escolha a distância, informe o tempo e a origem da corrida. A prévia mostra o que a marca muda no seu ranking.
        </DialogDescription>

        <ToggleGroup aria-label="Distância" aria-describedby={distanceProblem ? ids.distance : undefined} value={[`${choice}`]} className="mx-[18px] mt-[18px] grid w-auto grid-cols-6 gap-0 rounded-none border-b-2 border-solid border-white/15"
          onValueChange={next => { const picked = next[0]; if (picked) setChoice(picked === 'outra' ? 'outra' : Number(picked) as RunDistance) }}>
          {rulerItems.map(item => <ToggleGroupItem key={item.value} value={item.value}
            className="group/tick relative grid h-auto min-h-12 min-w-0 justify-items-center gap-1.5 rounded-none bg-transparent px-0 pt-0 pb-2.5 font-display text-[12px] font-bold text-white/55 hover:bg-transparent hover:text-white data-pressed:bg-transparent data-pressed:text-mint focus-visible:ring-mint/70">
            <span aria-hidden="true" className="h-3.5 w-0.5 bg-white/25 group-data-pressed/tick:h-[22px] group-data-pressed/tick:w-[3px] group-data-pressed/tick:bg-mint group-data-pressed/tick:shadow-[0_0_8px_var(--color-mint)]" />
            {item.label}
            <span aria-hidden="true" className="absolute inset-x-[20%] -bottom-0.5 hidden h-0.5 bg-mint group-data-pressed/tick:block" />
          </ToggleGroupItem>)}
        </ToggleGroup>
        {choice === 'outra' && <div className="mx-[18px] mt-3 grid gap-1.5">
          <label htmlFor={ids.meters} className={label}>Distância em metros</label>
          <div className="flex items-center gap-2.5">
            <input id={ids.meters} inputMode="numeric" autoComplete="off" placeholder="7000" value={otherMeters} aria-invalid={Boolean(distanceProblem) || undefined}
              aria-describedby={`${ids.meters}-hint`} onChange={event => setOtherMeters(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="min-h-12 border-white/18 bg-white/5 font-display text-[16px] font-bold text-white placeholder:text-white/35 focus-visible:border-mint focus-visible:outline-mint aria-invalid:border-danger-soft" />
            <span className="w-[68px] flex-none text-[12px] font-bold text-white/70 tabular-nums">{metersOk ? formatKm(meters) : 'm'}</span>
          </div>
          <small id={`${ids.meters}-hint`} className="text-[10.5px] leading-[1.5] text-white/60">
            De 1 000 a 100 000 m. Fora de 3, 5, 10, 21 e 42 km (com 2% de tolerância), a marca fica só no histórico.
          </small>
        </div>}
        <Problem id={ids.distance}>{distanceProblem}</Problem>

        <RunTimeFields className="mt-7" value={time} onChange={setTime} invalid={Boolean(problems?.duration_s)}
          describedBy={problems?.duration_s ? ids.time : undefined} />
        <Problem id={ids.time}>{problems?.duration_s}</Problem>
        <div className="mt-3.5 grid justify-items-center">
          <span className="text-[10px] tracking-[0.1em] text-white/60 uppercase">Ritmo</span>
          <b data-testid="run-pace" className="font-display text-[18px] text-mint tabular-nums">{pace ? formatPace(pace) : '—'}</b>
        </div>

        <div className="mx-[18px] mt-[18px] grid gap-3">
          <PlateChips variant="segmented" label="Origem da marca" options={sourceOptions} value={source} onChange={setSource} />
          {source === 'treino'
            ? <div className="grid gap-1.5">
              <span className={label}>Data</span>
              <DatePicker id={ids.date} label="Data" tone="dark" value={date} min={firstKey} max={todayKey} invalid={Boolean(problems?.date)}
                aria-describedby={problems?.date ? ids.date : undefined} onChange={setDate} />
              <Problem id={ids.date}>{problems?.date}</Problem>
              <small className="text-[10.5px] leading-[1.5] text-white/60">Treinos das últimas 52 semanas, até hoje.</small>
            </div>
            : <div className="grid gap-1.5">
              <span className={label}>Prova</span>
              <RunRaces races={raceList} loading={races.loading} error={races.error} selected={race ? race.entry_id : null}
                describedBy={problems?.entry_id ? ids.races : undefined} onRetry={races.reload} onFind={onFindRaces}
                onSelect={next => { setRaceId(next?.entry_id ?? null); if (next) setChoice(next.distance_km) }} />
              <Problem id={ids.races}>{problems?.entry_id}</Problem>
              <Problem id={ids.date}>{problems?.date}</Problem>
              {raceList.length > 0 && <small className="text-[10.5px] leading-[1.5] text-white/60">O dia da marca é o dia da prova.</small>}
            </div>}
        </div>

        <div role="status" aria-atomic="true" className="mx-[18px] mt-4 min-h-[68px]">
          {view ? <RunPreviewCard view={view} stale={!fresh} /> : <p className="m-0 text-[11px] leading-normal text-white/55 empty:hidden">{hint}</p>}
        </div>

        <footer className="sticky bottom-0 mt-auto bg-[linear-gradient(0deg,var(--color-night)_62%,transparent)] px-[18px] pt-5 pb-6">
          {problems?.general && <p role="alert" className="m-0 mb-2.5 text-[11.5px] leading-normal text-danger-soft">{problems.general}</p>}
          <button type="button" className={cn(teamButton({ tone: 'mint', size: 'block' }), 'min-h-12')} disabled={!input || busy || Boolean(problems?.blocked)}
            onClick={() => void save()}>
            <Check aria-hidden="true" />{busy ? 'Salvando…' : 'Salvar corrida'}
          </button>
        </footer>
      </div>
    </DialogContent>
  </Dialog>
}
