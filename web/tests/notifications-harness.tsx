import { useState } from 'react'
import type { NotificationFilter, NotificationTarget } from '../src/data/notifications'
import { useNotificationSummary } from '../src/hooks/useNotificationSummary'
import NotificationsPage from '../src/pages/NotificationsPage'
import { Toaster } from '../src/components/ui/toast'

/* Funções estáveis: `usePagedList` relê a lista se `onExpired` mudar a cada renderização. */
const noop = () => {}

/**
 * Tela de notificações com o resumo real (`useNotificationSummary`, lido de `GET /me/notifications/summary`) e o chip
 * guardado em estado, como o ArenaPage faz, e com o `Toaster` que o ArenaPage monta (os avisos saem na região "Avisos"). `onNavigate`, `onBack` e `onOpenFollowRequests` ficam à vista do teste.
 */
export function NotificationsHarness({ filter: initial = 'tudo', isAdmin, onNavigate = noop, onBack = noop, onOpenFollowRequests = noop, onExpired = noop }: {
  filter?: NotificationFilter
  isAdmin?: boolean
  onNavigate?: (target: NotificationTarget) => void
  onBack?: () => void
  onOpenFollowRequests?: () => void
  onExpired?: () => void
}) {
  const summary = useNotificationSummary(onExpired, 'home')
  const [filter, setFilter] = useState<NotificationFilter>(initial)
  return <>
    <NotificationsPage isAdmin={isAdmin} summary={summary} filter={filter} onFilter={setFilter} onBack={onBack}
      onOpenFollowRequests={onOpenFollowRequests} onNavigate={onNavigate} onExpired={onExpired} />
    <Toaster />
  </>
}
