import { Pressable, Text, View } from 'react-native'
import { useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'

/**
 * "Seu próximo passo" do Início (o mesmo cartão da web): "Complete seu perfil esportivo", com "Mostre onde e como você gosta
 * de jogar.", que abre a tela de modalidades. Quem usa só o renderiza enquanto falta alguma das três modalidades.
 */
export function ProximoPasso({ onOpen }: { onOpen: () => void }) {
  const c = useThemeColors()
  return <View testID="proximo-passo" className="mb-3.5">
    <Text accessibilityRole="header" className="mb-2 text-base font-bold text-heading">Seu próximo passo</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Complete seu perfil esportivo. Mostre onde e como você gosta de jogar."
      accessibilityHint="Abre suas modalidades" onPress={onOpen}
      style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1, borderColor: c['surface-edge'], backgroundColor: c.surface, padding: 14 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c['icon-tile'] }}>
        <Icon name="medal" size={22} color={c['icon-tile-ink']} />
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.heading, fontSize: 13, fontWeight: '700' }}>Complete seu perfil esportivo</Text>
        <Text numberOfLines={2} style={{ marginTop: 2, color: c['ink-muted'], fontSize: 11, lineHeight: 16 }}>Mostre onde e como você gosta de jogar.</Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="chevron" size={18} color={c['ink-muted']} /></View>
    </Pressable>
  </View>
}
