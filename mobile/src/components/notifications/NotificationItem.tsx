import { Pressable, Text, View } from 'react-native'
import type { ArenaNotification } from '../../api/notifications'
import { notificationView } from '../../data/notifications'
import type { NotificationView } from '../../data/notifications'
import { colors } from '../../theme'
import { relativeTime } from '../../utils/relativeTime'
import { TeamCrest } from '../arena/TeamCrest'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

/** Ícone dos avisos sem escudo de time: organizador, evento e, nas etapas 3 e 4, a partida, a agenda, o resultado, o W.O. e as quadras. */
export const kindIcon: Record<Exclude<NotificationView['kind'], 'team'>, IconName> = {
  organizer: 'user', event: 'trophy', match: 'zap', schedule: 'calendar-clock', result: 'clipboard-check', walkover: 'flag', court: 'map-pin', other: 'bell',
}

/** Escudo do time (iniciais do nome no aviso) ou o ícone do tipo, num quadrado de 38 pt; decorativo. */
export function NotificationLead({ view }: { view: NotificationView }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: view.kind === 'team' ? colors.tile : 'rgba(0,90,54,0.07)' }}>
    {view.kind === 'team' ? <TeamCrest name={view.teamName ?? 'Time'} size="sm" decorative /> : <Icon name={kindIcon[view.kind]} size={19} color={colors.brand} />}
  </View>
}

/** Rótulo lido por leitores de tela: o texto, o tempo e se ainda não foi lida. */
export const notificationLabel = (text: string, time: string, unread: boolean) => `${text}. ${time}${unread ? '. Não lida' : ''}`

/**
 * Linha de notificação: escudo do time (iniciais do nome no aviso) ou ícone, texto montado do `payload`, tempo
 * relativo e o ponto de não lida. Tocar marca como lida e, quando há destino, navega. A linha lida e sem destino não
 * é um botão.
 */
export function NotificationItem({ notification, busy, isAdmin = false, first = false, onOpen }: {
  notification: ArenaNotification
  busy: boolean
  isAdmin?: boolean
  first?: boolean
  onOpen: (notification: ArenaNotification) => void
}) {
  const view = notificationView(notification, { isAdmin })
  const unread = !notification.read_at
  const interactive = unread || Boolean(view.target)
  const time = relativeTime(notification.created_at)
  const content = <>
    <NotificationLead view={view} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: unread ? colors.ink : colors['ink-muted'], fontSize: 12, lineHeight: 17, fontWeight: unread ? '700' : '400' }}>{view.text}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 10.5, marginTop: 4 }}>{time}</Text>
    </View>
    {unread ? <View testID="unread-dot" style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: colors.brand }} /> : null}
    {view.target ? <View style={{ marginTop: 4 }}><Icon name="chevron" size={17} color={colors['ink-muted']} /></View> : null}
  </>
  const box = { minHeight: 56, flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }
  if (!interactive) return <View style={box}>{content}</View>
  return <Pressable accessibilityRole="button" accessibilityLabel={notificationLabel(view.text, time, unread)} accessibilityHint={view.target ? 'Abre a tela do aviso' : 'Marca como lida'}
    accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onOpen(notification)} style={{ ...box, backgroundColor: unread ? 'rgba(0,90,54,0.03)' : 'transparent' }}>
    {content}
  </Pressable>
}
