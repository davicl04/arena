import { Pressable, View } from 'react-native'
import { Text } from './Text'
import { cx } from '../styles'
import { useThemeColors } from '../hooks/useTheme'
import { Icon } from './Icon'

export const profileTabs = ['Fotos', 'Partidas'] as const
export type ProfileTab = typeof profileTabs[number]

/** Abas do conteúdo do perfil: Fotos | Partidas, com os ícones da web (grade e calendário). */
export function ProfileTabs({ value, onChange }: { value: ProfileTab; onChange: (value: ProfileTab) => void }) {
  const colors = useThemeColors()
  return <View accessibilityRole="tablist" accessibilityLabel="Conteúdo do perfil" className="mt-5 flex-row border-b border-line px-3.5">
    {profileTabs.map(tab => {
      const selected = value === tab
      return <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{ selected }} onPress={() => onChange(tab)}
        className={cx('min-h-12 grow basis-0 flex-row items-center justify-center gap-1.5 border-b-2', selected ? 'border-brand' : 'border-transparent')}>
        <Icon name={tab === 'Fotos' ? 'layout-grid' : 'calendar-days'} size={18} color={selected ? colors.brand : colors['ink-muted']} />
        <Text maxFontSizeMultiplier={1.3} className={selected ? 'text-[10.5px] font-bold text-brand' : 'text-[10.5px] font-bold text-ink-muted'}>{tab}</Text>
      </Pressable>
    })}
  </View>
}
