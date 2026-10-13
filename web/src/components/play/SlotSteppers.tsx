import { Minus, Plus } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { OpenSlots } from '@/api/matches'
import { positionOptions } from '@/data/arena'
import type { FootballFormat } from '@/data/arena'
import { cn } from '@/lib/utils'
import { maxSlots, slotTotal } from '@/data/match'
import { MAX_GOALKEEPER_SLOTS } from './slots'

const miniButton = 'grid size-8 place-items-center rounded-[10px] border border-solid border-white/18 bg-white/5 p-0 text-mint enabled:hover:bg-white/10 disabled:opacity-35'

/**
 * Contadores de vagas por posição (V2): GOL, DEF, MEI e ATA com −/+. Cada contagem é um `spinbutton` focável: as setas
 * (cima/direita aumentam, baixo/esquerda diminuem), Home e End mexem nela pelo teclado; os botões −/+ servem ao toque.
 * Os limites são os do servidor (`erro` mostra a resposta dele, no campo).
 */
export function SlotSteppers({ format, value, onChange, error, disabled = false }: {
  format: FootballFormat
  value: OpenSlots
  onChange: (next: OpenSlots) => void
  /** Mensagem do servidor para o campo `open_slots`. */
  error?: string
  disabled?: boolean
}) {
  const limit = maxSlots(format)
  const total = slotTotal(value)
  const cap = (position: keyof OpenSlots) => {
    const room = value[position] + Math.max(0, limit - total)
    return position === 'goleiro' ? Math.min(MAX_GOALKEEPER_SLOTS, room) : room
  }
  const set = (position: keyof OpenSlots, next: number) => {
    const bounded = Math.min(cap(position), Math.max(0, next))
    if (bounded !== value[position]) onChange({ ...value, [position]: bounded })
  }
  function onKey(event: KeyboardEvent<HTMLElement>, position: keyof OpenSlots) {
    const current = value[position]
    const next = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? current + 1
      : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? current - 1
        : event.key === 'Home' ? 0
          : event.key === 'End' ? cap(position)
            : null
    if (next === null) return
    event.preventDefault()
    set(position, next)
  }
  return <div data-slot="slot-steppers" className="grid gap-1.5">
    <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Vagas para avulsos por posição">
      {positionOptions.map(option => {
        const count = value[option.value]
        const max = cap(option.value)
        const label = option.label.toLocaleLowerCase('pt-BR')
        return <li key={option.value} role="group" aria-label={option.label}
          className="grid grid-cols-[auto_1fr_32px_28px_32px] items-center gap-2 text-[11.5px] text-white">
          <span aria-hidden="true" className="grid h-6 min-w-9 place-items-center rounded-md bg-white/10 px-1.5 font-display text-[10px] font-extrabold text-mint">{option.short}</span>
          <span className="min-w-0 truncate text-white/80">{option.label}</span>
          <button type="button" tabIndex={-1} className={miniButton} aria-label={`Menos uma vaga de ${label}`} disabled={disabled || count <= 0}
            onClick={() => set(option.value, count - 1)}><Minus size={15} aria-hidden="true" /></button>
          <span role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={`Vagas de ${label}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={count}
            aria-valuetext={`${count} ${count === 1 ? 'vaga' : 'vagas'}`} aria-disabled={disabled || undefined}
            onKeyDown={disabled ? undefined : event => onKey(event, option.value)}
            className={cn('grid h-8 place-items-center rounded-md font-display text-[14px] font-extrabold tabular-nums focus-visible:outline-mint')}>{count}</span>
          <button type="button" tabIndex={-1} className={miniButton} aria-label={`Mais uma vaga de ${label}`} disabled={disabled || count >= max}
            onClick={() => set(option.value, count + 1)}><Plus size={15} aria-hidden="true" /></button>
        </li>
      })}
    </ul>
    <p className="m-0 text-[10.5px] text-white/65" aria-live="polite">
      {total} de {limit} vagas · no máximo {MAX_GOALKEEPER_SLOTS} de goleiro
    </p>
    {error && <p role="alert" className="m-0 text-[11.5px] leading-normal text-danger-soft">{error}</p>}
  </div>
}
