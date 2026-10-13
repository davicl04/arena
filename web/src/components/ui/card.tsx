import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * Superfície branca com borda fina (no escuro, o degradê do utilitário `surface` com a borda acesa). radius card (16 px: .social-composer, .admin-reports, .match-card)
 * ou panel (18 px: .rank-card, .sport-card); elevated acrescenta a sombra de .rank-card.
 * Espaçamento interno e layout ficam no `className` (cada cartão atual tem o seu).
 * `as` troca o elemento (`article`, `section`, `form`) sem mudar o visual.
 */
const cardVariants = cva('border border-solid border-line surface noite:border-surface-edge', {
  variants: {
    radius: { card: 'rounded-card', panel: 'rounded-panel' },
    elevated: { true: 'shadow-card', false: '' },
  },
  defaultVariants: { radius: 'card', elevated: false },
})

export function Card({ as: Tag = 'div', className, radius, elevated, ...props }: HTMLAttributes<HTMLElement> & VariantProps<typeof cardVariants> & { as?: 'div' | 'article' | 'section' | 'form' }) {
  return <Tag data-slot="card" className={cn(cardVariants({ radius, elevated }), className)} {...props} />
}
