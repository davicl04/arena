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
 */
export function Sheet({ title, description, onClose, className, children }: {
  title: string
  description?: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  const { ref, onKeyDown } = useDialogFocus<HTMLElement>(onClose)
  return <>
    <div data-slot="sheet-scrim" data-testid="sheet-scrim" className="absolute inset-0 z-scrim bg-scrim" onClick={onClose} />
    <section ref={ref} data-slot="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
      className={cn('absolute inset-x-0 bottom-0 z-sheet max-h-[90%] overflow-x-hidden overflow-y-auto rounded-t-sheet bg-white px-5 pt-2 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-sheet outline-none', className)}>
      <div className="mx-auto mb-1.5 h-[5px] w-10 rounded-[3px] bg-line" aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} data-slot="sheet-title" className="text-[17px] wrap-anywhere">{title}</h2>
        <IconButton type="button" aria-label="Fechar" onClick={onClose}><X size={20} /></IconButton>
      </div>
      {description && <p data-slot="sheet-description" className="mb-1 text-[11.5px] leading-[1.5] text-ink-muted">{description}</p>}
      <div data-slot="sheet-body" className="grid min-w-0 gap-1">{children}</div>
    </section>
  </>
}

/** Rodapé da folha (.sheet .form-actions): botões lado a lado, com a mesma largura. */
export function SheetActions({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-actions" className={cn('mt-4 flex gap-2 *:flex-1', className)} {...props} />
}
