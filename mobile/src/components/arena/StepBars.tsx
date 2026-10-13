import { View } from 'react-native'
import { colors } from '../../theme'

/**
 * Barras de progresso dos passos (`.steps2`): `total` trilhos, os `done` primeiros em menta. `inset` é a margem lateral
 * quando a barra fica solta na tela (o assistente de evento); dentro de uma placa, o conteúdo já a tem.
 */
export function StepBars({ done, total, inset = 0 }: { done: number; total: number; inset?: number }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: 6, paddingHorizontal: inset, paddingTop: 6 }}>
    {Array.from({ length: total }, (_, index) => <View key={index} testID={index < done ? 'step-done' : 'step-todo'} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index < done ? colors.mint : 'rgba(255,255,255,0.14)' }} />)}
  </View>
}
