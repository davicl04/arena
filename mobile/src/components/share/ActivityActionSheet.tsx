import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import type { TimelineItem } from '../../api/profile'
import { useThemeColors } from '../../hooks/useTheme'
import { ActionButton } from '../arena/controls'
import { ActionSheet } from '../arena/ActionSheet'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { activityCaption } from './stickerView'

function ActionRow({ title, hint, icon, primary = false, onPress }: { title: string; hint: string; icon: IconName; primary?: boolean; onPress: () => void }) {
  const c = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} onPress={onPress}
    style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: primary ? 'transparent' : c.line, backgroundColor: primary ? c['brand-soft'] : c.surface, paddingHorizontal: 12, paddingVertical: 10 }}>
    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? c.brand : c.subtle }}>
      <Icon name={icon} size={19} color={primary ? c['on-brand'] : c.ink} />
    </View>
    <Text style={{ flexShrink: 1, color: primary ? c.brand : c.ink, fontSize: 14, fontWeight: '700' }}>{title}</Text>
  </Pressable>
}

/**
 * Folha de ações de uma atividade do próprio perfil (aba Partidas): "Compartilhar nos Stories" e, na partida, "Ver
 * partida". A corrida não tem tela própria, então a folha só compartilha. O título resume a atividade tocada.
 */
export function ActivityActionSheet({ item, onShare, onOpenMatch, onClose }: { item: TimelineItem; onShare: () => void; onOpenMatch?: () => void; onClose: () => void }) {
  return <ActionSheet title={activityCaption(item)} onClose={onClose}>
    <View testID="activity-actions" style={{ gap: 10, paddingTop: 8 }}>
      <ActionRow primary icon="stories" title="Compartilhar nos Stories" hint="Abre a prévia do Story com o adesivo do resultado" onPress={onShare} />
      {item.kind === 'partida' && onOpenMatch ? <ActionRow icon="arrow-right" title="Ver partida" hint="Abre a partida" onPress={onOpenMatch} /> : null}
      <View style={{ flexDirection: 'row', marginTop: 4 }}><ActionButton tone="outline" title="Cancelar" onPress={onClose} /></View>
    </View>
  </ActionSheet>
}
