import type { KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * Contador −/+ dos protótipos (R4): os botões atendem toque e leitor de tela; o número é um `spinbutton` focável, que
 * muda com as setas (cima/direita soma, baixo/esquerda subtrai), Page Up e Page Down (±5), Home e End. Os botões saem da
 * ordem de Tab para um placar de tênis não pedir 18 paradas.
 */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const step = 'grid flex-none place-items-center rounded-[9px] border border-solid border-line-strong bg-white text-brand enabled:hover:bg-subtle disabled:opacity-35'
const stepSize = { md: 'size-7', lg: 'size-8' }

export function Stepper({ value, onChange, label, min = 0, max = 99, size = 'md', disabled = false, className }: {
  value: number
  onChange: (value: number) => void
  /** Nome do valor, com inicial maiúscula ("Gols do Ferrugem FC"): vira o rótulo do número e, em minúsculas, dos botões. */
  label: string
  min?: number
  max?: number
  /** `lg` para o placar do futebol (30 px) e `md` para sets e estatísticas (18 px). */
  size?: 'md' | 'lg'
  disabled?: boolean
  className?: string
}) {
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next))
    if (clamped !== value) onChange(clamped)
  }
  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (disabled) return
    const delta = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 } as Record<string, number>)[event.key]
    if (delta !== undefined) set(value + delta)
    else if (event.key === 'Home') set(min)
    else if (event.key === 'End') set(max)
    else return
    event.preventDefault()
  }
  return (
    <span data-slot="stepper" className={cn('inline-flex items-center gap-1.5', className)}>
      <button type="button" tabIndex={-1} className={cn(step, stepSize[size])} disabled={disabled || value <= min} aria-label={`Menos ${lowerFirst(label)}`} onClick={() => set(value - 1)}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <span
        role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
        aria-disabled={disabled || undefined} onKeyDown={onKeyDown}
        className={cn('min-w-[1.4ch] rounded-md text-center font-display leading-none font-extrabold text-ink tabular-nums outline-focus focus-visible:outline-3 focus-visible:outline-offset-2',
          size === 'lg' ? 'text-[30px]' : 'text-[18px]')}
      >
        {value}
      </span>
      <button type="button" tabIndex={-1} className={cn(step, stepSize[size])} disabled={disabled || value >= max} aria-label={`Mais ${lowerFirst(label)}`} onClick={() => set(value + 1)}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </span>
  )
}

/**
 * Escolha de uma opção entre poucas (posição em que jogou): `radiogroup` com as setas movendo a seleção e o foco, como
 * as abas. `size="sm"` para as linhas do elenco.
 */
export function Segmented<T extends string>({ items, value, onChange, label, disabled = false, size = 'md', className }: {
  items: readonly { value: T; label: string; title?: string }[]
  value: T | null
  onChange: (value: T) => void
  label: string
  disabled?: boolean
  size?: 'md' | 'sm'
  className?: string
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const move = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key]
    if (move === undefined || disabled) return
    event.preventDefault()
    const next = (index + move + items.length) % items.length
    onChange(items[next].value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  const active = value ?? items[0]?.value
  return (
    <div data-slot="segmented" role="radiogroup" aria-label={label} className={cn('flex gap-1 rounded-[11px] bg-subtle p-[3px]', className)}>
      {items.map((item, index) => {
        const on = item.value === value
        return (
          <button
            key={item.value} type="button" role="radio" aria-checked={on} aria-label={item.title} title={item.title} disabled={disabled}
            tabIndex={item.value === active ? 0 : -1}
            onClick={() => onChange(item.value)} onKeyDown={event => onKeyDown(event, index)}
            className={cn('min-w-0 flex-1 rounded-lg border-0 font-bold',
              size === 'sm' ? 'min-h-8 text-[10px]' : 'min-h-9 text-[11px]',
              on ? 'bg-brand text-white' : 'bg-transparent text-ink-muted enabled:hover:bg-white/70')}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
