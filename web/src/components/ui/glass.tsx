import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { cn } from '@/lib/utils'
import { IconButton } from './button'

/*
 * Vidro escuro com papel de diálogo (substitui GlassPanel e .glass, .glass-media, .glass-screen,
 * .glass-head, .glass-badge, .glass-close, .glass-body).
 * media: absoluto sobre a foto de um post (não modal). screen: cobre o app inteiro (modal, com Tab preso).
 * Conteúdo: GlassChoices/GlassChoice, GlassConfirm, GlassActions, GlassTextarea (abaixo), glassMessageVariants
 * (glass-variants.ts) e Button `glass`, `glass-danger`, `glass-secondary`, `glass-link`.
 */
const glassVariants = cva('flex flex-col gap-2 overflow-hidden text-[#f1f3f2] outline-none backdrop-blur-[14px] motion-safe:animate-glass-in', {
  variants: {
    variant: {
      media: 'absolute inset-0 z-photo-glass bg-glass px-3 pt-1.5 pb-3',
      screen: 'absolute inset-0 z-glass-screen bg-glass-strong px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]',
    },
  },
})

export function Glass({ variant, label, title, badge, onClose, onBack, backLabel = 'Voltar', closeLabel = 'Fechar', className, bodyClassName, children }: {
  variant: 'media' | 'screen'
  label: string
  title?: string
  badge?: ReactNode
  onClose: () => void
  onBack?: () => void
  backLabel?: string
  closeLabel?: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const titleId = useId()
  const { ref, onKeyDown } = useDialogFocus<HTMLDivElement>(onClose, { trap: variant === 'screen' })
  return <div ref={ref} data-slot="glass" data-variant={variant} className={cn(glassVariants({ variant }), className)} role="dialog"
    aria-modal={variant === 'screen' ? true : undefined} aria-label={title ? undefined : label} aria-labelledby={title ? titleId : undefined}
    tabIndex={-1} onKeyDown={onKeyDown}>
    <div className="flex min-h-11 shrink-0 items-center gap-1.5">
      {onBack && <IconButton type="button" tone="glass" aria-label={backLabel} onClick={onBack}><ArrowLeft size={19} /></IconButton>}
      {title && <h2 id={titleId} data-slot="glass-title" className="min-w-0 text-[14px] text-white">{title}</h2>}
      {badge !== undefined && <span className="rounded-[8px] bg-[#ffffff1f] px-[7px] py-0.5 text-[10px] font-bold text-[#ffffffb3]">{badge}</span>}
      <IconButton type="button" tone="glass" className="ml-auto" aria-label={closeLabel} onClick={onClose}><X size={19} /></IconButton>
    </div>
    <div data-slot="glass-body" className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [scrollbar-width:none]', bodyClassName)}>{children}</div>
  </div>
}

/** Fileira de escolhas grandes do vidro (.glass-choices), centralizada na vertical (`mt-0` logo abaixo de outro bloco). */
export function GlassChoices({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="glass-choices" className={cn('my-auto flex justify-center gap-[26px]', className)} {...props} />
}

/** Escolha com ícone em círculo de 58 px e rótulo (.glass-choices button); `danger` tinge o círculo de vermelho. */
export function GlassChoice({ icon, danger, className, children, ...props }: ComponentProps<'button'> & { icon: ReactNode; danger?: boolean }) {
  return <button data-slot="glass-choice" className={cn('group/choice grid justify-items-center gap-2 rounded-xl border-0 bg-transparent p-1 text-[11px] font-bold text-white', className)} {...props}>
    <span className={cn('grid size-[58px] place-items-center rounded-full border border-solid group-hover/choice:bg-[#ffffff33]',
      danger ? 'border-[#ff8a9a66] bg-[#b9374955]' : 'border-[#ffffff33] bg-[#ffffff1f]')}>{icon}</span>
    {children}
  </button>
}

/** Linha de botões do vidro (.glass-actions), alinhada à direita; um `small` com `flex-1` ocupa o espaço à esquerda. */
export function GlassActions({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="glass-actions" className={cn('flex flex-wrap items-center justify-end gap-1.5', className)} {...props} />
}

/** Confirmação centralizada (.glass-confirm, .glass-question): pergunta, explicação e ações. */
export function GlassConfirm({ question, children, actions }: { question: ReactNode; children: ReactNode; actions: ReactNode }) {
  return <div data-slot="glass-confirm" className="my-auto max-w-[300px] self-center text-center">
    <p className="font-display text-[14px] font-bold text-white">{question}</p>
    <p className="mt-1.5 mb-3 text-[11.5px] leading-[1.5] text-[#ffffffa6]">{children}</p>
    <GlassActions className="justify-center">{actions}</GlassActions>
  </div>
}

/**
 * Campo de texto sobre o vidro (.glass textarea), com placeholder claro e foco verde-menta.
 * A fonte herdada vem de `textarea { font: inherit }` em `@layer base` (ui.css); altura mínima no `className`.
 */
export function GlassTextarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="glass-textarea" className={cn('block w-full min-w-0 resize-y rounded-xl border border-solid border-[#ffffff33] bg-[#ffffff1a] px-3 py-2.5 text-[12px] leading-[1.5] text-white placeholder:text-[#ffffff99] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint', className)} {...props} />
}
