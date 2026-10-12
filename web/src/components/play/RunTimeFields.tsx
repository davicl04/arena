import type { ChangeEvent, KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_DURATION_S, fromSeconds, toSeconds } from './runView'
import type { HmsParts } from './runView'

/*
 * Tempo da corrida em h : min : s (K2). Cada campo é um `spinbutton`: setas para cima e para baixo somam e tiram uma
 * unidade (com "vai um" entre os campos), PageUp e PageDown, dez; digitar troca os dois últimos dígitos (o campo vem
 * selecionado). Os botões de seta servem ao toque e saem da ordem do Tab, já que o teclado tem o equivalente.
 */

const fields = [
  { key: 'h', label: 'Horas', unit: 'h', one: 'hora', many: 'horas', max: 24, unitSeconds: 3600 },
  { key: 'm', label: 'Minutos', unit: 'min', one: 'minuto', many: 'minutos', max: 59, unitSeconds: 60 },
  { key: 's', label: 'Segundos', unit: 's', one: 'segundo', many: 'segundos', max: 59, unitSeconds: 1 },
] as const

const pad = (value: number) => String(value).padStart(2, '0')
const stepButton = 'grid h-[34px] w-11 place-items-center rounded-[10px] border-0 bg-white/6 text-mint hover:bg-white/12 focus-visible:outline-mint'

export function RunTimeFields({ value, onChange, invalid, describedBy, className }: {
  value: HmsParts
  onChange: (next: HmsParts) => void
  invalid?: boolean
  describedBy?: string
  className?: string
}) {
  /** Soma `delta` segundos ao tempo todo (com "vai um"), entre 0 e 24 h. */
  const shift = (delta: number) => onChange(fromSeconds(toSeconds(value) + delta))
  function type(key: 'h' | 'm' | 's', max: number, event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '').slice(-2)
    const next = { ...value, [key]: Math.min(max, Number(digits || 0)) }
    onChange(toSeconds(next) > MAX_DURATION_S ? fromSeconds(MAX_DURATION_S) : next)
  }
  function onKeyDown(unitSeconds: number, event: KeyboardEvent<HTMLInputElement>) {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
    const direction = steps[event.key]
    if (!direction) return
    event.preventDefault()
    shift(direction * unitSeconds)
  }
  return <div role="group" aria-label="Tempo da corrida" aria-describedby={describedBy} data-slot="run-time-fields"
    className={cn('flex items-start justify-center gap-1', className)}>
    {fields.map((field, index) => {
      const current = value[field.key]
      return <div key={field.key} className="contents">
        {index > 0 && <span aria-hidden="true" className="mt-[64px] grid gap-3 px-0.5"><i className="size-[5px] rounded-full bg-white/40" /><i className="size-[5px] rounded-full bg-white/40" /></span>}
        <div className="grid justify-items-center gap-0.5">
          <button type="button" tabIndex={-1} aria-label={`Mais ${field.many}`} className={stepButton} onClick={() => shift(field.unitSeconds)}>
            <ChevronUp size={20} aria-hidden="true" />
          </button>
          <input role="spinbutton" inputMode="numeric" autoComplete="off" aria-label={field.label} aria-invalid={invalid || undefined}
            aria-valuemin={0} aria-valuemax={field.max} aria-valuenow={current} aria-valuetext={`${current} ${current === 1 ? field.one : field.many}`}
            value={pad(current)} onChange={event => type(field.key, field.max, event)} onKeyDown={event => onKeyDown(field.unitSeconds, event)}
            onFocus={event => event.currentTarget.select()}
            className="min-h-0 w-[72px] rounded-[12px] border-transparent bg-transparent px-0 py-0.5 text-center font-display text-[56px] leading-none font-extrabold tracking-[-0.02em] text-white tabular-nums focus-visible:border-mint focus-visible:outline-mint aria-invalid:border-danger-soft/45" />
          <button type="button" tabIndex={-1} aria-label={`Menos ${field.many}`} className={stepButton} onClick={() => shift(-field.unitSeconds)}>
            <ChevronDown size={20} aria-hidden="true" />
          </button>
          <small aria-hidden="true" className="text-[10px] tracking-[0.1em] text-white/60 uppercase">{field.unit}</small>
        </div>
      </div>
    })}
  </div>
}
