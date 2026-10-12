import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { rankingTiers, tiers as tierInfo } from '@/data/arena'
import type { TierKey } from '@/data/arena'
import { cn } from '@/lib/utils'
import { darkError, darkInput } from './wizardStyles'

/*
 * Campos da tela escura do Criar evento (V4, `.flow.dark`): rótulo em caixa alta (`.sf-l`), campos de vidro, escolhas
 * em pílulas (`.seg2`, a escolhida em menta), elos (`.elochips`) e o contador de vagas (`.stepper`). Foco em menta.
 */

/** Mensagem de erro de um campo (lida pelo `aria-describedby`). */
export function DarkFieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={`${id}-error`} className={darkError}>{error}</p> : null
}

export interface ChoiceOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Nome acessível quando o rótulo visível tem ícone ou é abreviado. */
  ariaLabel?: string
}

const choiceItem = 'h-auto min-h-[40px] min-w-0 rounded-xl border border-solid border-white/18 bg-white/5 px-3 py-1.5 text-[12px] font-bold whitespace-normal text-white hover:bg-white/10 focus-visible:ring-mint/70 data-pressed:border-mint data-pressed:bg-mint data-pressed:text-night data-pressed:hover:bg-mint [&_[data-slot=sport-icon]]:mix-blend-screen [&_[data-slot=sport-icon]]:[filter:invert(1)] data-pressed:[&_[data-slot=sport-icon]]:mix-blend-multiply data-pressed:[&_[data-slot=sport-icon]]:[filter:none]'

/**
 * Escolha única em pílulas (ToggleGroup do Base UI: as setas movem o foco, Enter/Espaço escolhem). O rótulo visível
 * fica fora, ligado por `labelId`.
 */
export function DarkChoice<T extends string | number>({ id, labelId, options, value, onChange, error, describedById, className }: {
  id: string
  labelId: string
  options: readonly ChoiceOption<T>[]
  value: T | null
  onChange: (value: T) => void
  error?: string
  /** Id extra para o `aria-describedby` (uma dica abaixo do grupo). */
  describedById?: string
  className?: string
}) {
  const describe = [describedById, error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return <>
    <ToggleGroup id={id} aria-labelledby={labelId} aria-describedby={describe} aria-invalid={Boolean(error) || undefined}
      value={value === null ? [] : [String(value)]} className={cn('w-full flex-wrap gap-1.5', className)}
      onValueChange={next => {
        const chosen = options.find(option => String(option.value) === next[0])
        if (chosen && chosen.value !== value) onChange(chosen.value)
      }}>
      {options.map(option => <ToggleGroupItem key={String(option.value)} value={String(option.value)} aria-label={option.ariaLabel} className={choiceItem}>
        {option.label}
      </ToggleGroupItem>)}
    </ToggleGroup>
    <DarkFieldError id={id} error={error} />
  </>
}

const tierOrder = rankingTiers.map(tier => tier.image) as TierKey[]

/** Elos aceitos (vários): brasão e nome, na ordem Bronze → Lendário. */
export function TierChips({ id, labelId, value, onChange, error, describedById }: {
  id: string
  labelId: string
  value: readonly TierKey[]
  onChange: (value: TierKey[]) => void
  error?: string
  describedById?: string
}) {
  const describe = [describedById, error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return <>
    <ToggleGroup multiple id={id} aria-labelledby={labelId} aria-describedby={describe} aria-invalid={Boolean(error) || undefined}
      value={[...value]} className="mt-2 w-full flex-wrap gap-1.5"
      onValueChange={next => onChange(tierOrder.filter(tier => next.includes(tier)))}>
      {tierOrder.map(tier => <ToggleGroupItem key={tier} value={tier}
        className="h-auto min-h-9 rounded-[18px] border border-solid border-white/18 bg-white/5 py-1 pr-[11px] pl-1.5 text-[11.5px] font-bold text-white hover:bg-white/10 focus-visible:ring-mint/70 data-pressed:border-mint data-pressed:bg-mint/15 data-pressed:shadow-[inset_0_0_0_1px_var(--color-mint)]">
        <TierEmblem tier={tier} decorative className="size-[22px]" />{tierInfo[tier].name}
      </ToggleGroupItem>)}
    </ToggleGroup>
    <DarkFieldError id={id} error={error} />
  </>
}

const stepButton = 'grid size-10 flex-none place-items-center rounded-xl border border-solid border-white/18 bg-white/5 p-0 text-white hover:bg-white/10 focus-visible:outline-mint disabled:opacity-40'

/** Vagas livres (todos contra todos e corrida): campo numérico com − e +, dentro dos limites. */
export function CapacityStepper({ id, labelId, value, onChange, min, max, step = 1, unit, error, hintId }: {
  id: string
  labelId: string
  value: string
  onChange: (value: string) => void
  min: number
  max: number
  step?: number
  /** "times", "atletas" ou "corredores". */
  unit: string
  error?: string
  hintId?: string
}) {
  const current = /^\d+$/.test(value.trim()) ? Number(value) : null
  const change = (delta: number) => {
    const base = current ?? (delta > 0 ? min - delta : min)
    onChange(String(Math.min(max, Math.max(min, base + delta))))
  }
  return <>
    <div className="flex items-center gap-2.5">
      <button type="button" className={stepButton} aria-label="Menos vagas" disabled={current !== null && current <= min} onClick={() => change(-step)}><Minus size={18} aria-hidden="true" /></button>
      <input id={id} aria-labelledby={labelId} inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value} placeholder={String(min)}
        aria-invalid={Boolean(error) || undefined} aria-describedby={[hintId, error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
        onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
        className={cn(darkInput, 'w-[88px] flex-none text-center font-display text-[18px] font-extrabold')} />
      <button type="button" className={stepButton} aria-label="Mais vagas" disabled={current !== null && current >= max} onClick={() => change(step)}><Plus size={18} aria-hidden="true" /></button>
      <small className="min-w-0 text-[12px] text-white/70">{unit}</small>
    </div>
    <DarkFieldError id={id} error={error} />
  </>
}
