import { Text, View } from 'react-native'
import type { ArenaNotification } from '../../api/notifications'
import { deadlineSentence, notificationView, pendingDeadline, pendingView } from '../../data/notifications'
import { colors } from '../../theme'
import { relativeTime } from '../../utils/relativeTime'
import { ActionButton } from '../arena/controls'
import { NotificationLead } from './NotificationItem'

/** Verde da barra com prazo folgado e âmbar quando falta pouco (menos de 25% do tempo restante, regra em `pendingDeadline`). */
const ok = { bar: '#1f9d57', border: 'rgba(0,90,54,0.13)', label: colors.brand }
const warn = { bar: '#d99400', border: 'rgba(196,122,0,0.25)', label: '#8a5a00' }

/**
 * Cartão de uma pendência ("Para responder"): rótulo curto em caixa alta, o texto do aviso em negrito, o tempo, a barra do
 * prazo (do `created_at` até `action_until`), o que falta e o botão que marca como lida e leva à tela do aviso. A decisão
 * acontece lá; nada se resolve aqui. `now` vem de quem renderiza (um relógio por tela) para os prazos andarem juntos.
 */
export function PendingCard({ notification, now, busy, isAdmin = false, onOpen }: {
  notification: ArenaNotification
  now: number
  busy: boolean
  isAdmin?: boolean
  onOpen: (notification: ArenaNotification) => void
}) {
  const view = notificationView(notification, { isAdmin })
  const pending = pendingView(notification)
  const deadline = pendingDeadline(notification, now)
  const look = deadline.warn ? warn : ok
  const unread = !notification.read_at
  const left = deadlineSentence(deadline)
  return <View testID="pending-card" style={{ gap: 10, borderRadius: 18, borderWidth: 1, borderColor: look.border, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 13 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <NotificationLead view={view} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: look.label, fontFamily: 'monospace', fontSize: 9.5, fontWeight: '700', letterSpacing: 1.1, marginBottom: 2 }}>{pending.label}</Text>
        <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18, fontWeight: '700' }}>{view.text}</Text>
        <Text style={{ color: colors['ink-muted'], fontSize: 10.5, marginTop: 2 }}>{relativeTime(notification.created_at, now)}{unread ? ' · não lida' : ''}</Text>
      </View>
      {unread ? <View testID="unread-dot" style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: colors.brand }} /> : null}
    </View>
    {deadline.fraction !== null ? <View testID="deadline-bar" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ height: 5, overflow: 'hidden', borderRadius: 3, backgroundColor: 'rgba(52,61,57,0.08)' }}>
      <View style={{ width: `${Math.round(deadline.fraction * 100)}%`, height: 5, borderRadius: 3, backgroundColor: look.bar }} />
    </View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityLabel={left} style={{ flexShrink: 1, color: deadline.warn ? warn.label : colors['ink-muted'], fontSize: 11 }}>
        {deadline.remaining !== null && deadline.remaining !== 'encerrado' ? <>faltam <Text style={{ color: colors.ink, fontFamily: 'monospace', fontWeight: '700' }}>{deadline.remaining}</Text></> : left}
      </Text>
      <ActionButton size="sm" fit tone="brand" title={pending.action} accessibilityLabel={`${pending.action}: ${view.text}`} accessibilityHint="Marca como lida e abre a tela do aviso"
        disabled={busy} onPress={() => onOpen(notification)} />
    </View>
  </View>
}
