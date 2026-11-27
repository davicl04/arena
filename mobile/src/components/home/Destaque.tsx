import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import type { ArenaNotification } from '../../api/notifications'
import { deadlineSentence, notificationView, pendingDeadline, pendingView } from '../../data/notifications'
import { morePendingLabel, urgencyLabel } from '../../data/home'
import { useThemeColors } from '../../hooks/useTheme'
import { TextAction } from '../arena/controls'
import { NotificationLead } from '../notifications/NotificationItem'

/** Âmbar da borda de urgência: o mesmo da barra de prazo do cartão de pendência, igual nos dois temas. */
const URGENT_EDGE = '#d99400'

/**
 * Destaque do Início ("Para responder"): o cabeçalho com o total de pendências (`pending_count`) num selo âmbar e um cartão
 * claro com a primeira pendência da lista do servidor (já ordenada por urgência): o *lead* das notificações, "Mais urgente"
 * (prazo no fim, critério `warn`) ou "Aguardando você", o rótulo e a linha secundária, o prazo ("sem prazo" ou "faltam {tempo}",
 * âmbar com `warn`) e o botão visual "Responder". Com `warn`, o cartão ganha a borda âmbar à esquerda. O cartão inteiro é uma
 * única ação (`onOpen`: marca como lida e leva ao aviso); nada se aceita ou recusa aqui. Com mais de uma pendência, o link
 * "+ n pendências · ver todas" chama `onOpenAll`. Quem usa só o renderiza quando há pendência.
 */
export function Destaque({ notification, total, now, isAdmin = false, onOpen, onOpenAll }: {
  /** A primeira pendência da lista (`GET /me/notifications/pending?limit=1`). */
  notification: ArenaNotification
  /** Total de pendências abertas (`pending_count` do resumo). */
  total: number
  now: number
  isAdmin?: boolean
  onOpen: (notification: ArenaNotification) => void
  onOpenAll: () => void
}) {
  const colors = useThemeColors()
  const view = notificationView(notification, { isAdmin })
  const pending = pendingView(notification)
  const deadline = pendingDeadline(notification, now)
  const urgency = urgencyLabel(deadline.warn)
  const secondary = pending.secondary || view.text
  const due = deadlineSentence(deadline)
  const dueLook = deadline.warn ? { bg: colors['warning-bg'], fg: colors.warning }
    : deadline.remaining === null ? { bg: colors.subtle, fg: colors['ink-muted'] } : { bg: colors['brand-soft'], fg: colors.brand }
  const more = morePendingLabel(total)
  return <View testID="destaque" className="mb-3.5">
    <View className="mb-2 flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="text-[16px] font-bold text-heading">Para responder</Text>
      <View testID="destaque-total" accessible accessibilityLabel={`${total} ${total === 1 ? 'pendência' : 'pendências'}`}
        style={{ borderRadius: 99, backgroundColor: colors['warning-bg'], paddingHorizontal: 9, paddingVertical: 3 }}>
        <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{total}</Text>
      </View>
    </View>
    <Pressable testID="destaque-card" accessibilityRole="button" accessibilityLabel={`${urgency}: ${pending.label.toLowerCase()}. ${secondary}. ${due}`}
      accessibilityHint="Marca como lida e abre a tela do aviso" onPress={() => onOpen(notification)}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: colors['surface-edge'], backgroundColor: colors.surface, padding: 14,
        ...(deadline.warn ? { borderLeftWidth: 3, borderLeftColor: URGENT_EDGE } : null) }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <NotificationLead view={view} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text testID="destaque-urgency" style={{ color: deadline.warn ? colors.warning : colors.eyebrow, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{urgency}</Text>
            <Text numberOfLines={2} style={{ marginTop: 3, color: colors.heading, fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{pending.label}</Text>
            {secondary ? <Text numberOfLines={2} style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 11.5, lineHeight: 16 }}>{secondary}</Text> : null}
          </View>
        </View>
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View testID="destaque-deadline" style={{ flexShrink: 1, borderRadius: 99, backgroundColor: dueLook.bg, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text numberOfLines={1} style={{ color: dueLook.fg, fontFamily: 'monospace', fontSize: 10, fontWeight: '700' }}>{due}</Text>
          </View>
          <View style={{ minHeight: 36, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.brand, paddingHorizontal: 14 }}>
            <Text style={{ color: colors['on-brand'], fontSize: 12, fontWeight: '700' }}>Responder</Text>
          </View>
        </View>
      </View>
    </Pressable>
    {more ? <View style={{ alignItems: 'flex-start', marginTop: 2 }}>
      <TextAction title={more} accessibilityLabel={`Ver todas as ${total} pendências`} onPress={onOpenAll} />
    </View> : null}
  </View>
}
