import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * Quadro de ícone 38 px (.sport-icon).
 * square: fundo do app, cantos de 12 px e ícone verde; no escuro, o quadro dourado dos elos (ícones que não são de modalidade).
 * round: ladrilho redondo tingido `icon-tile` nos dois temas, para o selo da modalidade (`SeloLadrilho`) e o troféu do
 * campeonato sem modalidade.
 */
const iconTileVariants = cva('inline-grid size-[38px] place-items-center', {
  variants: {
    shape: {
      square: 'rounded-xl bg-app text-brand noite:bg-icon-tile noite:text-icon-tile-ink',
      round: 'rounded-full bg-icon-tile text-icon-tile-ink',
    },
  },
  defaultVariants: { shape: 'square' },
})

export function IconTile({ className, shape, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof iconTileVariants>) {
  return <span data-slot="icon-tile" data-shape={shape ?? 'square'} className={cn(iconTileVariants({ shape }), className)} {...props} />
}
