import { Pressable, View } from 'react-native'
import { Text } from './Text'
import { tabItems } from '../navigation/routes'
import type { TabScreen } from '../navigation/routes'
import { NAV_HEIGHT, NAV_PADDING_BOTTOM, useNavInset } from '../hooks/useBottomInset'
import { useResolvedTheme, useThemeColors } from '../hooks/useTheme'
import { ArenaMark } from './arena/ArenaMark'
import { Icon } from './Icon'

/** Medidas da web: barra de 82 (mais a parte da área segura que a folga de baixo não cobre), itens de 55 e o JOGAR subindo 25 acima do próprio item. */
const ITEM_HEIGHT = 55
const PLAY_RISE = 25
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
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  // A barra cobre a área segura de baixo (o indicador de início), com a folga de baixo dentro dela.
  const inset = useNavInset()
  return <View accessibilityRole="tablist" style={{ height: NAV_HEIGHT + inset, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 7, paddingBottom: NAV_PADDING_BOTTOM + inset, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.nav }}>
    {tabItems.map(item => {
      const on = active === item.screen
      const play = item.screen === 'play'
      const tint = on || play ? colors.heading : colors['ink-muted']
      // Moldura do item ativo (Início, Ranking, Comunidade e Perfil), como na web. Inativa, a caixa fica invisível, mas mantém
      // o tamanho, para os nomes ficarem na mesma linha.
      const box = { borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, borderColor: 'transparent' }
      const frame = !on ? box : { ...box, ...(dark ? { borderColor: '#f4de9a55' } : { borderColor: colors.line, shadowColor: '#495057', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } }) }
      return <Pressable key={item.screen} accessibilityRole="tab" accessibilityLabel={play && playAttention ? playAttentionLabel(item.label) : item.label} accessibilityState={{ selected: on }}
        onPress={() => onGo(item.screen)}
        style={{ flex: 1, height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6 }}>
        {play ? <View style={{ marginTop: -PLAY_RISE, width: 55, height: 55, borderRadius: 28, borderWidth: 4, borderColor: colors.app, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
          shadowColor: dark ? colors.mint : '#005a36', shadowOpacity: dark ? 0.25 : 0.3, shadowRadius: dark ? 13 : 7, shadowOffset: { width: 0, height: dark ? 0 : 5 }, elevation: 4 }}>
          <ArenaMark compact width={29} height={29} color={colors['on-brand']} />
          {playAttention ? <View testID="play-attention" accessible={false} importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', top: 1, right: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.app, backgroundColor: colors.mint }} /> : null}
        </View>
          : item.icon ? <View style={frame}><Icon name={item.icon} size={21} color={tint} /></View>
          : <View style={frame}><ArenaMark width={27} height={21} color={tint} /></View>}
        <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: tint, fontSize: 9, fontWeight: play ? '800' : on ? '700' : '400', letterSpacing: play && !on ? 0.27 : 0 }}>{item.label}</Text>
      </Pressable>
    })}
  </View>
}
