import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { cn } from '@/lib/utils'
import { IconButton } from './button'

/*
 * Folha inferior modal posicionada dentro do painel do app (não na viewport). Substitui BottomSheet
 * (.sheet-scrim, .sheet, .sheet-handle, .sheet-head, .sheet-sub, .sheet-body) com o mesmo foco:
 * foca `[data-autofocus]`, prende o Tab, fecha com Esc e devolve o foco (useDialogFocus).
 * Botões de rodapé (Cancelar/Salvar) ficam em `SheetActions`.
 * `tone="dark"` é a folha `forest` sobre a placa do Jogar (V2, "Preparar busca"): fundo verde-escuro, texto claro e a
 * classe `.dark`, que liga os tokens do shadcn (Switch, campos) ao tema escuro. `eyebrow` é a linha de apoio acima do título.
 */
export function Sheet({ title, description, eyebrow, tone = 'light', onClose, className, children }: {
  title: string
  description?: string
  eyebrow?: ReactNode
  tone?: 'light' | 'dark'
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  const { ref, onKeyDown } = useDialogFocus<HTMLElement>(onClose)
  const dark = tone === 'dark'
  return <>
    <div data-slot="sheet-scrim" data-testid="sheet-scrim" className="absolute inset-0 z-scrim bg-scrim" onClick={onClose} />
    <section ref={ref} data-slot="sheet" data-tone={tone} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
      className={cn('absolute inset-x-0 bottom-0 z-sheet max-h-[90%] overflow-x-hidden overflow-y-auto rounded-t-sheet bg-sheet px-5 pt-2 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-sheet outline-none',
        // A folha clara fixa a cor do texto: aberta sobre uma página escura (Criar time, placa do Jogar), não herda o branco.
        dark ? 'dark bg-forest' : 'text-ink noite:border-t noite:border-surface-edge', className)}>
      <div className={cn('mx-auto mb-1.5 h-[5px] w-10 rounded-[3px]', dark ? 'bg-white/25' : 'bg-line')} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {eyebrow && <span data-slot="sheet-eyebrow" className={cn('block text-[10px] font-bold tracking-[0.1em] uppercase', dark ? 'text-mint' : 'text-ink-muted')}>{eyebrow}</span>}
          <h2 id={titleId} data-slot="sheet-title" className="text-[17px] wrap-anywhere">{title}</h2>
        </div>
        <IconButton type="button" tone={dark ? 'glass' : 'default'} aria-label="Fechar" onClick={onClose}><X size={20} /></IconButton>
      </div>
      {description && <p data-slot="sheet-description" className={cn('mb-1 text-[11.5px] leading-[1.5]', dark ? 'text-white/65' : 'text-ink-muted')}>{description}</p>}
      <div data-slot="sheet-body" className="grid min-w-0 gap-1">{children}</div>
    </section>
  </>
}

/** Rodapé da folha (.sheet .form-actions): botões lado a lado, com a mesma largura. */
export function SheetActions({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-actions" className={cn('mt-4 flex gap-2 *:flex-1', className)} {...props} />
}
