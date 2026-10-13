import { ApiError } from '../api/client'
import { markNotificationRead } from '../api/notifications'
import type { ArenaNotification, NotificationSummary } from '../api/notifications'
import { notificationView } from '../data/notifications'
import type { NotificationTarget } from '../data/notifications'
import type { Navigation } from './useNavigation'

/** Abre a tela de destino da notificação (os identificadores vêm do `payload`, nunca do cliente). */
export function openTarget(navigation: Navigation, target: NotificationTarget) {
  switch (target.screen) {
    case 'teams': navigation.go('teams', { ...(target.teamId ? { teamId: target.teamId } : {}), ...(target.invites ? { invites: true } : {}), ...(target.requests ? { requests: true } : {}) }); break
    case 'organizer-request': navigation.go('organizer-request'); break
    // `section: 'tabela'` abre o detalhe do evento na aba Tabela (tabela publicada e campeonato encerrado).
    case 'event': navigation.go('event', { eventId: target.eventId, ...(target.section ? { section: target.section } : {}) }); break
    case 'event-manage': navigation.go('event-manage', { eventId: target.eventId }); break
    case 'event-receipts': navigation.go('event-receipts', { eventId: target.eventId }); break
    case 'event-matches': navigation.go('event-matches', { eventId: target.eventId, ...(target.matchId ? { matchId: target.matchId } : {}) }); break
    // Etapas 3 a 5: a placa do Jogar (`matchId` é a dica da proposta ou da oferta a abrir), a partida e a decisão do organizador.
    case 'play': if (target.matchId) navigation.go('play', { matchId: target.matchId }); else navigation.go('play'); break
    case 'match': navigation.go('match', { matchId: target.matchId }); break
    case 'result-decision': navigation.go('result-decision', { matchId: target.matchId }); break
    case 'admin-paid-events': navigation.go('admin-paid-events'); break
    case 'admin-refund-disputes': navigation.go('admin-refund-disputes'); break
    case 'admin-court-suggestions': navigation.go('admin-court-suggestions'); break
    case 'admin-walkover-disputes': navigation.go('admin-walkover-disputes'); break
  }
}

/**
 * Toque numa notificação (linha, cartão de pendência ou linha da placa do Início): marca como lida, se ainda não está, e leva à
 * tela do aviso. `onRead` recebe o resumo devolvido pelo servidor para quem chama atualizar o sino e as listas. Falha ao marcar:
 * com destino, a navegação segue (ler é secundário); sem destino, devolve a mensagem para a tela mostrar. 401 expira a sessão e
 * não navega. A pendência lida continua pendente: só a ação na tela de destino ou o prazo a resolvem.
 */
export async function openNotification(notification: ArenaNotification, { navigation, isAdmin, onRead, onExpired }: {
  navigation: Navigation
  isAdmin: boolean
  onRead: (summary: NotificationSummary) => void
  onExpired: () => void
}): Promise<string> {
  const { target } = notificationView(notification, { isAdmin })
  if (!notification.read_at) {
    try {
      onRead(await markNotificationRead(notification.id))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { onExpired(); return '' }
      if (!target) return cause instanceof Error && cause.message ? cause.message : 'Não foi possível marcar a notificação como lida.'
    }
  }
  if (target) openTarget(navigation, target)
  return ''
}
