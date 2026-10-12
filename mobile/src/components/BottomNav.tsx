import { Pressable, Text, View } from 'react-native'
import { tabItems } from '../navigation/routes'
import type { TabScreen } from '../navigation/routes'
import { colors } from '../theme'
import { ArenaMark } from './arena/ArenaMark'
import { Icon } from './Icon'

const BAR_HEIGHT = 82
/** Quanto o botão JOGAR sobe acima da barra. */
const PLAY_RISE = 24
/** Nome do JOGAR quando há algo em andamento: "JOGAR, há uma busca, proposta ou partida em andamento" (o aviso da web). */
export const playAttentionLabel = (label: string) => `${label}, há uma busca, proposta ou partida em andamento`

/**
 * Navegação inferior (padrão do `BottomNav` da web): Início | Ranking | JOGAR | Comunidade | Perfil, com o JOGAR no
 * centro, destacado e saliente. Ativo: texto em negrito e moldura no ícone. O botão sobressalente fica dentro da área
 * de toque do próprio item (o Android não entrega toques fora dos limites do pai).
 *
 * `playAttention` (o `attention` de `GET /me/play`: busca, proposta, oferta ou amistoso combinando) acende o ponto menta no
 * canto do botão JOGAR, como o ponto da web (contrato 0002, seção 9.3). O aviso vai no nome acessível do botão ("JOGAR, há
 * uma busca, proposta ou partida em andamento") e o ponto, decorativo, fica oculto para leitores de tela.
 */
export default function BottomNav({ active, onGo, playAttention = false }: { active: TabScreen; onGo: (screen: TabScreen) => void; playAttention?: boolean }) {
  return <View accessibilityRole="tablist" style={{ height: BAR_HEIGHT, flexDirection: 'row' }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: PLAY_RISE, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#ffffff' }} />
    {tabItems.map(item => {
      const on = active === item.screen
      const play = item.screen === 'play'
      const tint = on ? colors.ink : colors['ink-muted']
      return <Pressable key={item.screen} accessibilityRole="tab" accessibilityLabel={play && playAttention ? playAttentionLabel(item.label) : item.label} accessibilityState={{ selected: on }}
        onPress={() => onGo(item.screen)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingBottom: 8 }}>
        {play ? <View style={{ width: 55, height: 55, borderRadius: 28, borderWidth: 4, borderColor: colors.app, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
          <ArenaMark compact width={26} height={28} />
          {playAttention ? <View testID="play-attention" accessible={false} importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.app, backgroundColor: colors.mint }} /> : null}
        </View>
          : item.icon ? <View style={{ borderRadius: 14, borderWidth: 1, borderColor: on ? colors.line : 'transparent', paddingHorizontal: 12, paddingVertical: 4 }}><Icon name={item.icon} size={21} color={tint} /></View>
          : <View style={{ borderRadius: 14, borderWidth: 1, borderColor: on ? colors.line : 'transparent', paddingHorizontal: 12, paddingVertical: 4 }}><ArenaMark width={24} height={21} color={tint} /></View>}
        <Text style={{ color: tint, fontSize: 10, fontWeight: play ? '800' : on ? '700' : '500', letterSpacing: play ? 0.3 : 0 }}>{item.label}</Text>
      </Pressable>
    })}
  </View>
}
