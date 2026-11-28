import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import type { TimelineItem } from '@/api/profile'
import { activitySummary } from '@/components/profile-matches/timelineView'
import { Button } from '@/components/ui/button'
import { useDialogContainer } from '@/components/ui/dialog'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** Ícone de Stories: o quadro arredondado com a lente (genérico, sem marca de terceiros). */
export function StoriesIcon({ size = 20 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
}

function ActionRow({ primary = false, icon, children, onClick, autoFocus = false }: {
  primary?: boolean
  icon: ReactNode
  children: ReactNode
  onClick: () => void
  autoFocus?: boolean
}) {
  return <button type="button" data-autofocus={autoFocus || undefined} onClick={onClick}
    className={cn('flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-solid px-3 py-2.5 text-left text-[14px] font-bold',
      primary ? 'border-transparent bg-success-bg text-brand' : 'border-line surface text-ink noite:border-surface-edge')}>
    <span aria-hidden="true" className={cn('grid size-9 flex-none place-items-center rounded-full', primary ? 'bg-brand text-on-brand' : 'bg-subtle text-ink')}>{icon}</span>
    {children}
  </button>
}

/**
 * Folha de ações de uma atividade do perfil próprio (rodadas 8 e 9 do protótipo): "Compartilhar nos Stories" e, na
 * partida, "Ver partida". A corrida não tem tela própria e só compartilha. Entra no `app-frame` por portal, acima da
 * navegação inferior (diálogo centralizado em tablet e computador), com o foco preso e o fechamento por Escape, pelo
 * fundo, pelo Fechar ou por Cancelar.
 */
export function ShareActionSheet({ item, onShare, onOpenMatch, onClose }: {
  item: TimelineItem
  onShare: () => void
  onOpenMatch?: () => void
  onClose: () => void
}) {
  const container = useDialogContainer()
  const run = item.kind === 'corrida'
  const sheet = <Sheet eyebrow={run ? 'Sua corrida' : 'Sua partida'} title={activitySummary(item)} onClose={onClose}>
    <div className="mt-3 grid gap-2.5">
      <ActionRow primary autoFocus icon={<StoriesIcon />} onClick={onShare}>Compartilhar nos Stories</ActionRow>
      {!run && onOpenMatch && <ActionRow icon={<ArrowRight size={20} />} onClick={onOpenMatch}>Ver partida</ActionRow>}
      <Button type="button" variant="secondary" className="w-full" onClick={onClose}>Cancelar</Button>
    </div>
  </Sheet>
  return container ? createPortal(sheet, container) : sheet
}
