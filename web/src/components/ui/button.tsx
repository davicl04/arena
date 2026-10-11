import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { buttonVariants, iconButtonVariants } from './button-variants'

/** Botão ARENA: primary, secondary, text, link, glass, glass-danger, glass-secondary, glass-link (ver button-variants.ts). */
function Button({ className, variant, size, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

/** Botão redondo de ícone (tons default, glass, photo, cover, outline, approve, glass-small, send); o rótulo acessível é obrigatório. */
function IconButton({ className, tone, ...props }: React.ComponentProps<'button'> & VariantProps<typeof iconButtonVariants> & { 'aria-label': string }) {
  return <button data-slot="icon-button" className={cn(iconButtonVariants({ tone }), className)} {...props} />
}

export { Button, IconButton }
