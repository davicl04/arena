import { Image, View } from 'react-native'
import type { Sport } from '../../api/client'
import { sportIcons } from '../../data/sportIcons'

/**
 * Ícone provisório da modalidade (PNG com fundo branco, multiplicado sobre o fundo claro). Fica sempre oculto para
 * leitores de tela: o nome da modalidade aparece no texto vizinho. `inverted` é para a placa escura: inverte as cores e
 * mistura em `screen`, o que faz o fundo branco sumir.
 */
export function SportIcon({ sport, size = 24, inverted = false }: { sport: Sport; size?: number; inverted?: boolean }) {
  const inner = Math.round(size * 1.38)
  return <View accessible={false} importantForAccessibility="no-hide-descendants" testID={`sport-icon-${sport}`}
    style={[{ width: size, height: size, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, inverted ? { mixBlendMode: 'screen', filter: [{ invert: 1 }] } : { mixBlendMode: 'multiply' }]}>
    <Image source={sportIcons[sport]} resizeMode="contain" style={{ width: inner, height: inner, flexShrink: 0 }} />
  </View>
}
