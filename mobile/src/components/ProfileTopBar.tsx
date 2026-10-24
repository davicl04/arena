import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useThemeColors } from '../hooks/useTheme'
import { cx } from '../styles'
import { Icon } from './Icon'
import type { IconName } from './Icon'

// Mesma altura da classe h-14 da barra.
export const TOP_BAR_HEIGHT = 56

/**
 * Condensa a barra quando a rolagem passa da capa. Guarda só o booleano no estado,
 * para não renderizar o perfil a cada evento de rolagem.
 */
export function useCondensedTopBar(coverHeight: number) {
  const [condensed, setCondensed] = useState(false)
  const last = useRef(false)
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y > coverHeight - TOP_BAR_HEIGHT
    if (next !== last.current) { last.current = next; setCondensed(next) }
  }, [coverHeight])
  return { condensed, onScroll }
}

/** Botão redondo da barra: vidro claro sobre a capa, sem fundo quando a barra está condensada. */
export function TopBarButton({ label, icon, onPress, condensed }: { label: string; icon: IconName; onPress: () => void; condensed: boolean }) {
  const colors = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    className={cx('min-h-11 min-w-11 items-center justify-center rounded-[22px]', condensed ? 'bg-transparent' : 'bg-glass-light')}>
    <Icon name={icon} size={22} color={condensed ? colors.ink : '#343d39'} />
  </Pressable>
}

/** Barra fixa do perfil, posicionada fora do ScrollView. Depois da capa, ganha fundo claro e @usuário. */
export default function ProfileTopBar({ condensed, username, leading, trailing, trailingWidth = 52 }: {
  condensed: boolean; username: string; leading?: ReactNode; trailing?: ReactNode
  /** Largura do lado direito: 52 pt para um botão, 96 pt com o sino e o Menu (o @usuário perde um pouco do centro para não truncar em 320 px). */
  trailingWidth?: number
}) {
  return <View pointerEvents="box-none" className={cx('absolute top-0 right-0 left-0 z-10 h-14 flex-row items-center border-line px-2', condensed ? 'border-b bg-surface elevation-sm' : 'bg-transparent')}>
    <View className="w-[52px] items-start">{leading}</View>
    <View className="grow basis-0 items-center">
      {condensed ? <Text numberOfLines={1} accessibilityRole="header" className="text-[16px] font-bold text-ink"><Text className="text-brand">@</Text>{username}</Text> : null}
    </View>
    <View style={{ width: trailingWidth }} className="flex-row items-center justify-end">{trailing}</View>
  </View>
}
