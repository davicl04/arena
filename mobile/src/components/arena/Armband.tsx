import { Text, View } from 'react-native'
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg'
import { colors } from '../../theme'
import { useThemeColors } from '../../hooks/useTheme'

export interface ArmbandProps {
  /**
   * `corner` (padrão): selo menta "C" no canto da foto, no elenco e nos convites; o elemento pai precisa de posição
   * relativa (padrão do React Native). `inline`: braçadeira dourada ao lado do nome, no chat da partida (C1).
   */
  variant?: 'corner' | 'inline'
  /** Tamanho do selo `corner`: sm 13 pt · md 15 pt (padrão) · lg 20 pt (folha do atleta). */
  size?: 'sm' | 'md' | 'lg'
  /** Contorno do selo `corner`: `light` (branco, sobre fundos claros) ou `dark` (sobre a placa `forest`). */
  ring?: 'light' | 'dark'
}

const cornerSizes = { sm: { box: 13, font: 7 }, md: { box: 15, font: 8.5 }, lg: { box: 20, font: 11 } } as const

/** Braçadeira de capitão "C", que identifica os representantes do time (`accessibilityLabel="Representante"`). */
export function Armband({ variant = 'corner', size = 'md', ring = 'light' }: ArmbandProps) {
  const c = useThemeColors()
  if (variant === 'inline') {
    return <View accessibilityRole="image" accessibilityLabel="Representante" style={{ alignSelf: 'center' }}>
      <Svg width={20} height={13} viewBox="0 0 22 14">
        <Rect x={1} y={1} width={20} height={12} rx={3} fill="#f2c14e" />
        <Path d="M5 1 V13 M17 1 V13" stroke={colors.forest} strokeOpacity={0.25} />
        <SvgText x={11} y={10.4} textAnchor="middle" fontSize={8.5} fontWeight="800" fill={colors.forest}>C</SvgText>
      </Svg>
    </View>
  }
  const measure = cornerSizes[size]
  return <View accessibilityRole="image" accessibilityLabel="Representante"
    style={{ position: 'absolute', right: -4, bottom: -3, width: measure.box, height: measure.box, borderRadius: 4, borderWidth: 1.5, borderColor: ring === 'dark' ? colors.forest : c.surface, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: colors.night, fontSize: measure.font, fontWeight: '800', lineHeight: measure.font + 2 }}>C</Text>
  </View>
}
