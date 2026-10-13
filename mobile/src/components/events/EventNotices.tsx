import { Text, View } from 'react-native'
import { eventMessagesPath } from '../../api/events'
import type { EventMessage } from '../../api/events'
import { usePagedList } from '../../hooks/usePagedList'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { relativeTime } from '../../utils/relativeTime'
import { Icon } from '../Icon'
import { LoadError } from '../arena/LoadError'
import { Button } from '../ui'

/**
 * Canal de avisos do evento (0003, seção 10.1): o organizador escreve e os inscritos leem, do mais recente ao mais
 * antigo. O aviso automático do cancelamento aparece em destaque. Só leitura no app do atleta.
 */
export function EventNotices({ eventId, onExpired }: { eventId: number; onExpired: () => void }) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  const list = usePagedList<EventMessage>(eventMessagesPath(eventId), onExpired)
  return <View accessibilityLabel="Avisos do organizador" style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
      <Icon name="megaphone" size={16} color={colors.brand} />
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Avisos do organizador</Text>
    </View>
    {list.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 11, paddingHorizontal: 4 }}>Carregando avisos…</Text>
      : list.error ? <LoadError size="section" title="Não foi possível carregar os avisos" text={list.error.message} cause={list.error} onRetry={list.reload} />
        : list.items.length === 0 ? <Text style={{ borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, color: colors['ink-muted'], fontSize: 11, lineHeight: 16 }}>
          Nenhum aviso do organizador por enquanto. Os avisos aparecem aqui e nas suas notificações.
        </Text>
          : <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: colors.surface }}>
            {list.items.map((message, index) => {
              const cancelled = message.kind === 'evento_cancelado'
              return <View key={message.id} testID={`notice-${message.kind}`} style={{ gap: 4, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line, backgroundColor: cancelled ? (dark ? '#ff8a801a' : '#fff0f2') : colors.surface }}>
                {cancelled ? <Text style={{ color: colors.danger, fontSize: 11.5, fontWeight: '700' }}>Evento cancelado</Text> : null}
                <Text selectable style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>{message.body}</Text>
                <Text style={{ color: colors['ink-muted'], fontSize: 10 }}>{message.author?.name ?? 'Organizador'} · {relativeTime(message.created_at)}</Text>
              </View>
            })}
          </View>}
    {list.moreError ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>{list.moreError}</Text> : null}
    {list.hasMore ? <Button secondary title={list.busy ? 'Carregando…' : 'Ver avisos anteriores'} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </View>
}
