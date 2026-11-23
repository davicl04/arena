import { Image, View } from 'react-native'
import type { Sport } from '../../api/client'
import { useResolvedTheme } from '../../hooks/useTheme'
import { sportIcons, sportIconsAlpha } from '../../data/sportIcons'

/**
 * Ícone provisório da modalidade. No claro, o PNG com fundo branco multiplicado sobre o fundo claro. No escuro
 * (`useResolvedTheme`), a versão com fundo transparente tingida de branco, ou de `color` quando o contexto pede (chip
 * ativo sobre `brand`, por exemplo). Fica sempre oculto para leitores de tela: o nome da modalidade aparece no texto
 * vizinho. `inverted` é para a placa escura: no claro inverte as cores e mistura em `screen`, o que faz o fundo branco
 * sumir (no escuro o resultado já é traço branco). `alpha` usa a versão com fundo transparente nos dois temas, tingida de
 * `color` (o símbolo grande e translúcido das faixas da tela de modalidades).
 */
export function SportIcon({ sport, size = 24, inverted = false, alpha = false, color }: { sport: Sport; size?: number; inverted?: boolean; alpha?: boolean; color?: string }) {
  const inner = Math.round(size * 1.38)
  const night = useResolvedTheme() === 'dark'
  const box = { width: size, height: size, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const }
  if (night || alpha) {
    return <View accessible={false} importantForAccessibility="no-hide-descendants" testID={`sport-icon-${sport}`} style={box}>
      <Image source={sportIconsAlpha[sport]} resizeMode="contain" tintColor={color ?? '#ffffff'} style={{ width: inner, height: inner, flexShrink: 0 }} />
    </View>
  }
  return <View accessible={false} importantForAccessibility="no-hide-descendants" testID={`sport-icon-${sport}`}
    style={[box, inverted ? { mixBlendMode: 'screen', filter: [{ invert: 1 }] } : { mixBlendMode: 'multiply' }]}>
    <Image source={sportIcons[sport]} resizeMode="contain" style={{ width: inner, height: inner, flexShrink: 0 }} />
  </View>
}
