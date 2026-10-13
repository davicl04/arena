import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * Chip de modalidade (.sport-chip). Ativo (.sport-chip.active) com `active` ou `aria-pressed`.
 * size="sm" reproduz o chip do perfil (.profile-sports .sport-chip, sempre preenchido: use `active`).
 * O ícone de modalidade (SportIcon, `data-slot="sport-icon"`) dentro do chip tem no mínimo 20 px
 * e fica claro (tela + inversão em cinza) quando o chip está ativo (`data-active`).
 */
const sportIcon = '[&_[data-slot=sport-icon]]:min-h-5 [&_[data-slot=sport-icon]]:min-w-5 data-active:[&_[data-slot=sport-icon]]:mix-blend-screen data-active:[&_[data-slot=sport-icon]]:[filter:grayscale(1)_invert(1)]'
const chipVariants = cva(['inline-flex items-center gap-1.5 rounded-[18px] border border-solid border-line bg-transparent font-bold text-ink-muted', sportIcon], {
  variants: {
    size: { default: 'min-h-9 px-3 text-[11px]', sm: 'min-h-[29px] px-2 text-[9px]' },
    active: { true: 'border-brand bg-brand text-white', false: 'aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white' },
  },
  defaultVariants: { size: 'default', active: false },
})
type ChipVariants = VariantProps<typeof chipVariants>

/** Chip como botão de filtro (use `aria-pressed`). */
export function Chip({ className, size, active, ...props }: ComponentProps<'button'> & ChipVariants) {
  const on = Boolean(active) || props['aria-pressed'] === true || props['aria-pressed'] === 'true'
  return <button data-slot="chip" data-active={on ? '' : undefined} className={cn(chipVariants({ size, active }), className)} {...props} />
}

/** Chip estático (rótulo). */
export function ChipLabel({ className, size, active, ...props }: ComponentProps<'span'> & ChipVariants) {
  return <span data-slot="chip" data-active={active ? '' : undefined} className={cn(chipVariants({ size, active }), className)} {...props} />
}
