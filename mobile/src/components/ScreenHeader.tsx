import { Pressable, Text, View } from 'react-native'
import { useThemeColors } from '../hooks/useTheme'
import { Icon } from './Icon'

/** Barra das telas empilhadas: voltar, título e um espaço do tamanho do botão para centralizar o título. */
export default function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const colors = useThemeColors()
  return <View className="min-h-14 flex-row items-center justify-between px-3.5 pt-1.5">
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} className="min-h-11 min-w-11 items-center justify-center">
      <Icon name="arrow-left" size={22} color={colors.ink} />
    </Pressable>
    <Text accessibilityRole="header" numberOfLines={1} className="shrink px-2 text-[17px] font-bold text-ink">{title}</Text>
    <View className="w-11" />
  </View>
}
