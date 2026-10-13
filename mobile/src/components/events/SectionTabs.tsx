import { Pressable, Text, View } from 'react-native'
import { colors } from '../../theme'

/**
 * Abas do detalhe (D2: Informações | Tabela ou Percurso | Inscritos): faixa cinza com a aba ativa em pílula branca,
 * como a variante `track` da web. Cada aba tem 44 pt de altura e anuncia a seleção.
 */
export function SectionTabs<T extends string>({ items, value, onChange, label }: {
  items: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4, borderRadius: 13, backgroundColor: '#d3d7dd', padding: 4 }}>
    {items.map(item => {
      const selected = item.value === value
      return <Pressable key={item.value} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => onChange(item.value)}
        style={{ minHeight: 44, minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 4, backgroundColor: selected ? '#ffffff' : 'transparent' }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12, fontWeight: selected ? '700' : '600' }}>{item.label}</Text>
      </Pressable>
    })}
  </View>
}
