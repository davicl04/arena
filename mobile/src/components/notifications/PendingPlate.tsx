import { Pressable, Text, View } from 'react-native'
import type { ArenaNotification } from '../../api/notifications'
import { deadlineSentence, notificationView, pendingDeadline, pendingView } from '../../data/notifications'
import { colors } from '../../theme'
import { TeamCrest } from '../arena/TeamCrest'
import { TeamsPlate } from '../arena/TeamsPlate'
import { TextAction } from '../arena/controls'
import { Icon } from '../Icon'
import { kindIcon } from './NotificationItem'

const tags = {
  ok: { background: 'rgba(143,224,180,0.12)', color: colors.mint },
  warn: { background: 'rgba(255,207,107,0.15)', color: '#ffcf6b' },
  none: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)' },
} as const

function PendingRow({ notification, now, isAdmin, first, onOpen }: { notification: ArenaNotification; now: number; isAdmin: boolean; first: boolean; onOpen: (notification: ArenaNotification) => void }) {
  const view = notificationView(notification, { isAdmin })
  const pending = pendingView(notification)
  const deadline = pendingDeadline(notification, now)
  const tag = tags[deadline.remaining === null ? 'none' : deadline.warn ? 'warn' : 'ok']
  const secondary = pending.secondary || view.text
  return <Pressable accessibilityRole="button" accessibilityLabel={`${pending.label.toLowerCase()}. ${secondary}. ${deadlineSentence(deadline)}`} accessibilityHint="Marca como lida e abre a tela do aviso"
    onPress={() => onOpen(notification)}
    style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingVertical: 9 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.08)' }}>
      {view.kind === 'team' ? <TeamCrest name={view.teamName ?? 'Time'} size="xs" decorative /> : <Icon name={kindIcon[view.kind]} size={18} color={colors.mint} />}
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '700' }}>{pending.label}</Text>
      <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>{secondary}</Text>
    </View>
    <View style={{ borderRadius: 11, backgroundColor: tag.background, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: tag.color, fontFamily: 'monospace', fontSize: 9.5, fontWeight: '700' }}>{deadline.remaining ?? 'sem prazo'}</Text>
    </View>
    <Icon name="chevron" size={17} color="rgba(255,255,255,0.55)" />
  </Pressable>
}

/**
 * Placa "Para responder" do Início: `forest` com o Coliseu, o sino menta e o total, até duas pendências (rótulo, linha
 * secundária, tempo que falta e chevron) e o link "Ver as N pendências" (ou "Ver notificações" com 2 ou menos), que abre a tela
 * no chip *Para responder*. Tocar numa linha marca como lida e leva à tela do aviso. Sem pendências, quem a usa não a renderiza.
 */
export function PendingPlate({ items, total, now, isAdmin = false, onOpenItem, onOpenAll }: {
  items: readonly ArenaNotification[]
  /** Total de pendências abertas (`pending_count` do resumo); as linhas mostram as 2 mais urgentes. */
  total: number
  now: number
  isAdmin?: boolean
  onOpenItem: (notification: ArenaNotification) => void
  onOpenAll: () => void
}) {
  const shown = items.slice(0, 2)
  const count = Math.max(total, shown.length)
  return <TeamsPlate round={20} testID="pending-plate">
    <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="bell" size={16} color={colors.mint} />
        <Text accessibilityRole="header" style={{ flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '800' }}>Para responder</Text>
        <View accessibilityLabel={`${count} ${count === 1 ? 'pendência' : 'pendências'}`} accessible style={{ borderRadius: 11, backgroundColor: colors.mint, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: colors.night, fontFamily: 'monospace', fontSize: 10.5, fontWeight: '700' }}>{count}</Text>
        </View>
      </View>
      {shown.map((item, index) => <PendingRow key={item.id} notification={item} now={now} isAdmin={isAdmin} first={index === 0} onOpen={onOpenItem} />)}
      <View style={{ alignItems: 'flex-start' }}>
        <TextAction surface="dark" title={count > 2 ? `Ver as ${count} pendências` : 'Ver notificações'} onPress={onOpenAll} />
      </View>
    </View>
  </TeamsPlate>
}
