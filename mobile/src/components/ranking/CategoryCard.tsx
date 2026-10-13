import { Pressable, Text, View } from 'react-native'
import type { Sport } from '../../api/client'
import { colors } from '../../theme'
import { SportIcon } from '../arena/SportIcon'
import { Icon } from '../Icon'

/** Cartão "Categoria": o ícone da modalidade e o texto da categoria atual ("Futebol · Society 7×7 · Times"); abre a folha de filtros. */
export function CategoryCard({ sport, text, onOpen }: { sport: Sport; text: string; onOpen: () => void }) {
  return <Pressable testID="category-card" accessibilityRole="button" accessibilityLabel={`Categoria: ${text}. Alterar`} onPress={onOpen}
    style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 10 }}>
    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.tile }}><SportIcon sport={sport} size={26} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontWeight: '800', letterSpacing: 1 }}>CATEGORIA</Text>
      <Text numberOfLines={1} style={{ marginTop: 1, color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{text}</Text>
    </View>
    <Icon name="list-filter" size={19} color={colors.ink} />
  </Pressable>
}
