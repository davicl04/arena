import { Text, View } from 'react-native'
import { getQueueCounts } from '../../api/admin'
import { listOpenOrganizerEvents } from '../../api/events'
import { getOrganizerStatus } from '../../api/organizer'
import { useResource } from '../../hooks/useResource'
import type { Navigation } from '../../navigation/useNavigation'
import { cx, tw } from '../../styles'
import { Notice, MenuRow, TextAction } from '../arena/controls'
import { OrganizerCard, OrganizerEvents } from './OrganizerCard'

/**
 * Seções do Menu do Perfil ligadas ao organizador e à administração (como `MenuPage` da web): o cartão "Organizar no
 * Arena" (P3) enquanto não há permissão, a seção Organizador · Meus eventos com a permissão (ou com eventos em aberto) e,
 * para a administração, as filas com os contadores de `queue-counts`. As telas de destino são de outras frentes: aqui só
 * se navega.
 */
export default function OrganizerMenu({ isAdmin, navigation, onLeave, onExpired }: {
  isAdmin: boolean
  navigation: Navigation
  /** Fecha o Menu antes de abrir outra tela. */
  onLeave: () => void
  onExpired: () => void
}) {
  const organizer = useResource(getOrganizerStatus, onExpired, { fallback: 'Não foi possível carregar o seu pedido de organizador.' })
  const counts = useResource(getQueueCounts, onExpired, { enabled: isAdmin })
  const events = useResource(listOpenOrganizerEvents, onExpired, { fallback: 'Não foi possível carregar os seus eventos.' })
  const status = organizer.data
  const eventItems = events.data?.items ?? []
  // A seção aparece com a permissão ou quando há eventos em aberto (contrato 0003, seção 14).
  const showEvents = status?.state === 'aprovado' || eventItems.length > 0
  const go: Navigation['go'] = (...args) => { onLeave(); navigation.go(...args) }
  const queue = counts.data

  return <>
    <Text className={cx(tw.eyebrow, 'mt-5')}>ORGANIZADOR</Text>
    {organizer.loading ? <Text accessibilityLiveRegion="polite" className="mb-2 text-[12px] text-ink-muted">Carregando a área do organizador…</Text> : null}
    {organizer.error ? <View><Notice>{organizer.error}</Notice><TextAction title="Tentar novamente" onPress={organizer.reload} /></View> : null}
    {status && status.state !== 'aprovado' ? <OrganizerCard status={status} onRequest={() => go('organizer-request')} onChange={organizer.setData} onExpired={onExpired} /> : null}
    {showEvents ? <OrganizerEvents status={status} events={eventItems} loading={events.loading} error={status?.state === 'aprovado' ? events.error : ''}
      onReload={events.reload} onOpenList={() => go('organizer-events')} onOpenEvent={eventId => go('event-manage', { eventId })} onCreate={() => go('event-wizard')} /> : null}
    {isAdmin ? <>
      <Text className={cx(tw.eyebrow, 'mt-5')}>ADMINISTRAÇÃO</Text>
      <MenuRow icon="badge-check" title="Pedidos de organizador" badge={queue?.organizer_requests} onPress={() => go('admin-organizer-requests')} />
      <MenuRow icon="banknote" title="Eventos pagos" badge={queue?.paid_events} onPress={() => go('admin-paid-events')} />
      <MenuRow icon="shield-off" title="Eventos de organizador revogado" badge={queue?.revoked_events} onPress={() => go('admin-revoked-events')} />
      <MenuRow icon="rotate-ccw" title="Devoluções contestadas" badge={queue?.refund_disputes} onPress={() => go('admin-refund-disputes')} />
      <MenuRow icon="map-pinned" title="Sugestões de quadra" badge={queue?.court_suggestions} onPress={() => go('admin-court-suggestions')} />
      <MenuRow icon="gavel" title="W.O. contestados" badge={queue?.walkover_disputes} onPress={() => go('admin-walkover-disputes')} />
      <MenuRow icon="flag" title="Denúncias" badge={queue?.reports} onPress={() => go('moderation')} />
    </> : null}
  </>
}
