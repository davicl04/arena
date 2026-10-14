import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

/**
 * Lavagem de cor sobre um fundo escuro: um gradiente de `color` (com `from` de opacidade) até transparente em `reach` (0 a 1)
 * da altura, ou da largura com `horizontal`. É um `Svg` absoluto (o app não tem `expo-linear-gradient`), fora da árvore de
 * acessibilidade; o dono da peça precisa de `overflow: hidden` e fundo próprio.
 */
export function Wash({ id, color, from = 0.85, reach = 0.55, horizontal = false }: { id: string; color: string; from?: number; reach?: number; horizontal?: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
          <Stop offset="0" stopColor={color} stopOpacity={String(from)} />
          <Stop offset={String(reach)} stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  </View>
}
