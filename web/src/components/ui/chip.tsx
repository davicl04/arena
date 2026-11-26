import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * Chip de modalidade (.sport-chip). Ativo (.sport-chip.active) com `active` ou `aria-pressed`.
 * size="sm" reproduz o chip do perfil (.profile-sports .sport-chip, sempre preenchido: use `active`).
 * O ícone de modalidade (SportIcon forma="aro", `data-slot="sport-icon"`) dentro do chip tem no mínimo 20 px e herda a cor
 * do texto (`currentColor`): no chip ativo, o texto sobre a marca (`on-brand`). Nos filtros por modalidade, quem usa o
 * chip mostra o símbolo com aro só no chip ativo; o inativo fica só com o texto, sem espaço reservado.
 */
const sportIcon = '[&_[data-slot=sport-icon]]:min-h-5 [&_[data-slot=sport-icon]]:min-w-5'
const chipVariants = cva(['inline-flex items-center gap-1.5 rounded-[18px] border border-solid border-line bg-transparent font-bold text-ink-muted', sportIcon], {
  variants: {
    size: { default: 'min-h-9 px-3 text-[11px]', sm: 'min-h-[29px] px-2 text-[9px]' },
    active: { true: 'border-brand bg-brand text-on-brand', false: 'aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-on-brand' },
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
