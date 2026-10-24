import { Pressable, Text, View } from 'react-native'
import type { NotificationSummary } from '../../api/notifications'
import { notificationFilters, summaryLine } from '../../data/notifications'
import type { NotificationFilter } from '../../data/notifications'
import { TeamsPlate } from '../arena/TeamsPlate'
import { TextAction } from '../arena/controls'
import { Icon } from '../Icon'
import { PlateChips } from '../play/PlateChips'
import type { PlateOption } from '../play/PlateChips'

/** Chips da tela: *Para responder* mostra o total de pendências; as categorias, as não lidas, só quando há; *Tudo*, nenhum número. */
export function filterOptions(summary: NotificationSummary | null): PlateOption<NotificationFilter>[] {
  return notificationFilters.map(({ value, label }) => {
    const count = !summary || value === 'tudo' ? 0 : value === 'responder' ? summary.pending_count : summary.unread_by_category?.[value] ?? 0
    if (count <= 0) return { value, label }
    const noun = value === 'responder' ? (count === 1 ? 'pendência' : 'pendências') : count === 1 ? 'não lida' : 'não lidas'
    return { value, label, detail: String(count), accessibilityLabel: `${label}, ${count} ${noun}` }
  })
}

/**
 * Placa `forest` das Notificações (Coliseu ao fundo): voltar, título, "Ler todas" (só com não lidas), a linha de resumo e os
 * chips *Tudo · Para responder · Partidas · Times · Eventos*, um grupo de escolha única. Sem o resumo (ainda lendo ou com
 * erro), fica sem a linha e sem números nos chips.
 */
export function NotificationsPlate({ summary, filter, onFilter, busy, onBack, onReadAll }: {
  summary: NotificationSummary | null
  filter: NotificationFilter
  onFilter: (filter: NotificationFilter) => void
  busy: boolean
  onBack: () => void
  onReadAll: () => void
}) {
  return <TeamsPlate bottom={20} testID="notifications-plate">
    <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, paddingHorizontal: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' }}>
        <Icon name="arrow-left" size={21} color="#ffffff" />
      </Pressable>
      <Text accessibilityRole="header" style={{ flex: 1, color: '#ffffff', fontSize: 19, fontWeight: '800' }}>Notificações</Text>
      {summary && summary.unread_count > 0
        ? <TextAction surface="dark" title="Ler todas" accessibilityLabel="Marcar todas as notificações como lidas" disabled={busy} onPress={onReadAll} /> : null}
    </View>
    {summary ? <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17 }}>{summaryLine(summary)}</Text> : <View style={{ height: 12 }} />}
    <View style={{ paddingHorizontal: 16 }}>
      <PlateChips label="Filtrar notificações" options={filterOptions(summary)} value={filter} onChange={onFilter} />
    </View>
  </TeamsPlate>
}
