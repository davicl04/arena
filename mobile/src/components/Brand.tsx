import { View } from 'react-native'
import { useThemeColors } from '../hooks/useTheme'
import { colors as fixedColors } from '../theme'
import { ArenaMark } from './arena/ArenaMark'
import { Text } from './Text'

/**
 * Marca `arena.` (o `Logo` da web, components/Brand.tsx): Coliseu, "arena" em Sora 800 e o ponto circular verde na base
 * das letras. `tone="theme"` segue o tema (título `heading`, ponto `brand`: verde no claro, menta no escuro);
 * `tone="dark"` é a marca sobre bloco escuro por design (branca, ponto menta), igual nos dois temas.
 */
export function Logo({ tone = 'theme' }: { tone?: 'theme' | 'dark' }) {
  const themeColors = useThemeColors()
  const ink = tone === 'dark' ? '#ffffff' : themeColors.heading
  const dot = tone === 'dark' ? fixedColors.mint : themeColors.brand
  return <View accessible accessibilityRole="image" accessibilityLabel="Arena" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
    <ArenaMark width={44} height={32} color={ink} />
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text display style={{ color: ink, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -1.56 }}>arena</Text>
      <View style={{ width: 5, height: 5, marginLeft: 2, marginBottom: 9, borderRadius: 3, backgroundColor: dot }} />
    </View>
  </View>
}
