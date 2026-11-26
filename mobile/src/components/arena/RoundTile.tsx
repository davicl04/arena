import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { Sport } from '../../api/client'
import { useThemeColors } from '../../hooks/useTheme'
import { SportIcon } from './SportIcon'

/** O selo ocupa 75% do diâmetro do ladrilho redondo. */
const SELO_NO_LADRILHO = 0.75

/**
 * Ladrilho redondo: a variante circular do quadro de ícone, no tingido `icon-tile` do tema, para o selo da modalidade e o
 * troféu do campeonato sem modalidade. Decorativo e oculto para leitores de tela; os demais quadros de ícone (cantos
 * arredondados) não mudam.
 */
export function RoundTile({ size, testID, children }: { size: number; testID?: string; children: ReactNode }) {
  const c = useThemeColors()
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}
    style={{ width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: size / 2, backgroundColor: c['icon-tile'] }}>
    {children}
  </View>
}

/** Selo da modalidade no ladrilho redondo de `size` pontos (o tamanho do quadro de cada contexto). */
export function SeloTile({ sport, size }: { sport: Sport; size: number }) {
  return <RoundTile size={size} testID={`selo-tile-${sport}`}><SportIcon sport={sport} shape="selo" size={Math.round(size * SELO_NO_LADRILHO)} /></RoundTile>
}
