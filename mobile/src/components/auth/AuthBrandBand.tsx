import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme'
import { ArenaMark } from '../arena/ArenaMark'
import { Wash } from '../ranking/Wash'

/** Brilho verde do topo da faixa (o radial `#0f3a26` da Dividida web), em gradiente vertical sobre o `forest`. */
const BAND_GLOW = '#0f3a26'
const COLOSSEUM_WIDTH = 340
const COLOSSEUM_HEIGHT = 191

/** Marca `arena.`: Coliseu, texto e ponto menta circular na base das letras (como o `Logo` da web). */
function BrandLogo() {
  return <View accessible accessibilityRole="image" accessibilityLabel="Arena" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
    <ArenaMark width={44} height={32} color="#ffffff" />
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={{ color: '#ffffff', fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -1.5 }}>arena</Text>
      <View style={{ width: 5, height: 5, marginLeft: 2, marginBottom: 7, borderRadius: 3, backgroundColor: colors.mint }} />
    </View>
  </View>
}

/**
 * Faixa da marca da Dividida estreita (tela de entrada do Expo): fundo `forest`, a marca, o Coliseu dourado esmaecido
 * (decorativo, fora da árvore de acessibilidade) e o título do modo, com o trecho em destaque em menta. Escura por design:
 * as cores são fixas e iguais nos dois temas. Sobe por baixo da barra de status (o `App` tira a margem de cima da área segura).
 */
export function AuthBrandBand({ register }: { register: boolean }) {
  const insets = useSafeAreaInsets()
  return <View testID="auth-brand-band" style={{ overflow: 'hidden', backgroundColor: colors.forest, paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 26 }}>
    <Wash id="auth-band-glow" color={BAND_GLOW} from={1} reach={0.9} />
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', right: -70, bottom: -46, width: COLOSSEUM_WIDTH, height: COLOSSEUM_HEIGHT, opacity: 0.16 }}>
      <ArenaMark width={COLOSSEUM_WIDTH} height={COLOSSEUM_HEIGHT} color={colors.legend} />
    </View>
    <BrandLogo />
    <Text accessibilityRole="header" style={{ marginTop: 40, maxWidth: 330, color: '#ffffff', fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 }}>
      {register ? <>Sua trajetória <Text style={{ color: colors.mint }}>começa aqui</Text></> : <>A <Text style={{ color: colors.mint }}>arena</Text> te chama</>}
    </Text>
    <Text style={{ marginTop: 10, color: '#9aaba1', fontSize: 15, lineHeight: 22 }}>Futebol, tênis e corrida amadores.</Text>
  </View>
}
