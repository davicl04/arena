import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from './Text'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { cx } from '../styles'
import { useResolvedTheme, useThemeColors } from '../hooks/useTheme'
import { Icon } from './Icon'
import { COVER_GLASS, COVER_GLASS_LINE } from './notifications/NotificationBell'

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

/** Botão redondo da barra: vidro escuro sobre a capa (o `tone="cover"` da web), sem fundo quando a barra está condensada. */
export function TopBarButton({ label, glyph, onPress, condensed }: { label: string; glyph: string; onPress: () => void; condensed: boolean }) {
  const themeColors = useThemeColors()
  const icon = glyph === '☰' ? 'menu' : glyph === '‹' ? 'arrow-left' : null
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={condensed ? undefined : { backgroundColor: COVER_GLASS, borderWidth: 1, borderColor: COVER_GLASS_LINE }}
    className="min-h-11 min-w-11 items-center justify-center rounded-[22px]">
    {icon ? <Icon name={icon} size={21} color={condensed ? themeColors.ink : '#ffffff'} />
      : <Text className={cx(condensed ? 'text-ink' : 'text-white', 'text-[20px]', glyph === '•••' ? 'font-extrabold' : 'font-normal')}>{glyph}</Text>}
  </Pressable>
}

/**
 * Barra fixa do perfil, posicionada fora do ScrollView. Depois da capa, ganha fundo claro e @usuário. A capa sobe por baixo da
 * barra de status (`useTopArea('bleed')`): a barra desce a área segura de cima, e os ícones do sistema ficam claros sobre a capa.
 */
export default function ProfileTopBar({ condensed, username, leading, trailing, trailingWidth = 52 }: {
  condensed: boolean; username: string; leading?: ReactNode; trailing?: ReactNode
  /** Largura do lado direito: 52 pt para um botão, 96 pt com o sino e o Menu (o @usuário perde um pouco do centro para não truncar em 320 px). */
  trailingWidth?: number
}) {
  const top = useSafeAreaInsets().top
  const dark = useResolvedTheme() === 'dark'
  return <View pointerEvents="box-none" style={{ paddingTop: top, height: TOP_BAR_HEIGHT + top }}
    className={cx('absolute top-0 right-0 left-0 z-10 flex-row items-center border-line px-2', condensed ? 'border-b bg-surface elevation-sm' : 'bg-transparent')}>
    <StatusBar style={condensed && !dark ? 'dark' : 'light'} />
    <View className="w-[52px] items-start">{leading}</View>
    <View className="grow basis-0 items-center">
      {condensed ? <Text numberOfLines={1} accessibilityRole="header" className="text-[16px] font-bold text-ink"><Text className="text-brand">@</Text>{username}</Text> : null}
    </View>
    <View style={{ width: trailingWidth }} className="flex-row items-center justify-end">{trailing}</View>
  </View>
}
