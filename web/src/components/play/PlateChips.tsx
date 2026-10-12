import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export interface PlateOption<T extends string> {
  value: T
  label: ReactNode
  /** Nome acessível quando o rótulo visível é abreviado ou tem ícone. */
  ariaLabel?: string
}

/*
 * Escolha única sobre a placa `forest` (ToggleGroup do Base UI: setas movem o foco, Enter/Espaço escolhem).
 * `segmented` → chave "Com meu time | Avulso" (fundo de vidro, escolhida em menta); `pill` → pílulas com contorno
 * (posições, distâncias e formatos), a escolhida com contorno e texto menta.
 */
const groupClass = {
  segmented: 'grid w-full auto-cols-fr grid-flow-col gap-[3px] rounded-[13px] bg-white/8 p-[3px]',
  pill: 'flex w-full flex-wrap justify-center gap-1.5',
}
const itemClass = {
  segmented: 'h-9 min-w-0 rounded-[10px] px-2 text-[11.5px] font-semibold text-white/70 hover:bg-white/8 hover:text-white data-pressed:bg-mint data-pressed:font-bold data-pressed:text-night data-pressed:hover:bg-mint data-pressed:hover:text-night',
  pill: 'h-auto min-h-8 rounded-full border border-solid border-white/15 bg-transparent px-[11px] py-1.5 text-[10.5px] font-bold text-white/70 hover:bg-white/8 hover:text-white data-pressed:border-mint data-pressed:bg-mint/8 data-pressed:text-mint data-pressed:hover:bg-mint/12 data-pressed:hover:text-mint',
}

export function PlateChips<T extends string>({ label, options, value, onChange, variant = 'pill', disabled, className }: {
  label: string
  options: readonly PlateOption<T>[]
  value: T
  onChange: (value: T) => void
  variant?: 'segmented' | 'pill'
  disabled?: boolean
  className?: string
}) {
  return <ToggleGroup aria-label={label} value={[value]} disabled={disabled} className={cn(groupClass[variant], className)}
    onValueChange={next => { const chosen = next[0] as T | undefined; if (chosen && chosen !== value) onChange(chosen) }}>
    {options.map(option => <ToggleGroupItem key={option.value} value={option.value} aria-label={option.ariaLabel}
      className={cn(itemClass[variant], 'focus-visible:ring-mint/70 [&_svg]:size-[15px]')}>
      {option.label}
    </ToggleGroupItem>)}
  </ToggleGroup>
}
