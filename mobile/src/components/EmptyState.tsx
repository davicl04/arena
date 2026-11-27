import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useThemeColors } from '../hooks/useTheme'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Text } from './Text'
import { ArenaMark } from './arena/ArenaMark'

/** Estado vazio (o `EmptyState` da web): quadro do ícone (ou do Coliseu), título em Sora 15, texto e uma ação opcional. */
export function EmptyState({ icon, title, text, action, testID }: { icon: IconName | 'coliseum'; title: string; text: string; action?: ReactNode; testID?: string }) {
  const colors = useThemeColors()
  return <View testID={testID} className="items-center px-3 py-8">
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="mb-3.5 size-14 items-center justify-center rounded-[18px] bg-icon-tile">
      {icon === 'coliseum' ? <ArenaMark width={34} height={24} color={colors['icon-tile-ink']} /> : <Icon name={icon} size={26} color={colors['icon-tile-ink']} />}
    </View>
    <Text accessibilityRole="header" className="text-center text-[15px] leading-[22px] text-heading">{title}</Text>
    <Text className="mt-1.75 max-w-[280px] text-center text-[12px] leading-[20px] text-ink-muted">{text}</Text>
    {action ? <View className="mt-4">{action}</View> : null}
  </View>
}
