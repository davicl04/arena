import { Pressable, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { sports } from '../../api/client'
import type { Profile, Sport } from '../../api/client'
import { useThemeColors } from '../../hooks/useTheme'
import { colors } from '../../theme'
import { SportIcon } from '../arena/SportIcon'
import { bandLabel, profileSummary } from './profileSteps'

/** Altura e cantos da faixa (os mesmos da web). */
const BAND_HEIGHT = 132
const BAND_RADIUS = 20

/**
 * Faixa de uma modalidade na tela de modalidades: a peça inteira é um botão que abre a folha passo a passo. Inativa, usa a
 * superfície do tema com "Toque para ativar" e a frase da modalidade; ativa, o degradê `forest → brand` (igual nos dois
 * temas, bloco escuro por design), o selo menta "● Ativa" e o resumo do perfil. Sem nível, elo ou pontos.
 */
export function SportBand({ sport, profile, onPress }: { sport: Sport; profile?: Profile; onPress: () => void }) {
  const c = useThemeColors()
  const info = sports.find(item => item.value === sport)
  const active = Boolean(profile)
  const detail = profile ? profileSummary(profile) : (info?.description ?? '')
  return <Pressable testID={`sport-band-${sport}`} accessibilityRole="button" accessibilityLabel={bandLabel(sport, profile)} accessibilityHint={detail} onPress={onPress}
    style={{ height: BAND_HEIGHT, marginBottom: 12, overflow: 'hidden', borderRadius: BAND_RADIUS, borderWidth: 1, borderColor: active ? 'transparent' : c['surface-edge'], backgroundColor: active ? colors.forest : c.surface }}>
    {active ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`sport-band-${sport}`} x1="0" y1="0" x2="1" y2="0.6">
            <Stop offset="0" stopColor={colors.forest} />
            <Stop offset="1" stopColor={colors.brand} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#sport-band-${sport})`} />
      </Svg>
    </View> : null}
    <View pointerEvents="none" style={{ position: 'absolute', right: -14, bottom: -18, opacity: active ? 0.16 : 0.08 }}>
      <SportIcon sport={sport} size={150} alpha color={active ? '#ffffff' : c['icon-tile-ink']} />
    </View>
    <View style={{ position: 'absolute', top: 16, right: 16, bottom: 16, left: 16, justifyContent: 'space-between' }}>
      <Text style={{ alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '700', color: active ? colors.night : c['icon-tile-ink'], backgroundColor: active ? colors.mint : c['icon-tile'] }}>
        {active ? '● Ativa' : 'Toque para ativar'}
      </Text>
      <View>
        <Text style={{ color: active ? '#ffffff' : c.heading, fontSize: 24, fontWeight: '800' }}>{info?.label ?? sport}</Text>
        <Text numberOfLines={2} style={{ marginTop: 3, color: active ? 'rgba(255,255,255,0.8)' : c['ink-muted'], fontSize: 11.5, lineHeight: 16 }}>{detail}</Text>
      </View>
    </View>
  </Pressable>
}
