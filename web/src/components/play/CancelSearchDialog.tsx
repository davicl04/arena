import type { RefObject } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { teamButton } from '../teams/styles'

/**
 * Confirmação de "Cancelar busca" (tocar no botão redondo durante a busca). O foco inicial fica em "Continuar buscando",
 * para um toque acidental não derrubar a posição na fila; Esc também mantém a busca. Se o cancelamento falha, o erro sai
 * em toast (`useSubmit`) e o diálogo continua aberto para tentar de novo.
 */
export function CancelSearchDialog({ busy, onKeep, onConfirm, returnFocus }: {
  busy: boolean
  onKeep: () => void
  onConfirm: () => void
  returnFocus?: RefObject<HTMLElement | null>
}) {
  return <Dialog open onOpenChange={next => { if (!next && !busy) onKeep() }}>
    <DialogContent finalFocus={returnFocus} showCloseButton={false} data-testid="cancel-search-dialog" className="sm:max-w-[calc(100%-2rem)]">
      <DialogHeader className="pr-0">
        <DialogTitle>Cancelar a busca?</DialogTitle>
        <DialogDescription>Você sai da fila e perde o tempo de espera. Dá para buscar de novo quando quiser.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button type="button" className={teamButton({ tone: 'outline', size: 'md' })} disabled={busy} onClick={onKeep}>Continuar buscando</button>
        <button type="button" className={teamButton({ tone: 'danger', size: 'md' })} disabled={busy} onClick={onConfirm}>{busy ? 'Cancelando…' : 'Cancelar busca'}</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
