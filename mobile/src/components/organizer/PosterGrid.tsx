import { Children } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'

/** Cartazes em duas colunas (linhas de dois; o último, sozinho, ocupa só a metade). */
export function PosterGrid({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children)
  const rows: ReactNode[][] = []
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2))
  return <View accessibilityLabel={label} style={{ gap: 10 }}>
    {rows.map((row, index) => <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
      {row.map((item, column) => <View key={column} style={{ flex: 1, minWidth: 0 }}>{item}</View>)}
      {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
    </View>)}
  </View>
}

/** Último cartaz da lista (O3): contorno tracejado e "Novo evento", que abre o Criar evento. */
export function NewEventPoster({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  return <Pressable accessibilityRole="button" accessibilityLabel="Novo evento" accessibilityHint="Abre o assistente de criação" onPress={onPress}
    style={{ minHeight: 196, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors['line-strong'], backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)', padding: 12 }}>
    <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['success-bg'] }}><Icon name="plus" size={22} color={colors.brand} /></View>
    <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '800' }}>Novo evento</Text>
  </Pressable>
}
