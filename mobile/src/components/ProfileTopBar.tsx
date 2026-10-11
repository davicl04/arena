import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

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
export function TopBarButton({ label, glyph, onPress, condensed }: { label: string; glyph: string; onPress: () => void; condensed: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 44, minWidth: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: condensed ? 'transparent' : '#ffffffd9' }}>
    <Text style={{ fontSize: glyph === '‹' ? 26 : 20, color: '#343d39', fontWeight: glyph === '•••' ? '800' : '400' }}>{glyph}</Text>
  </Pressable>
}

/** Barra fixa do perfil, posicionada fora do ScrollView. Depois da capa, ganha fundo claro e @usuário. */
export default function ProfileTopBar({ condensed, username, leading, trailing }: { condensed: boolean; username: string; leading?: ReactNode; trailing?: ReactNode }) {
  return <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_HEIGHT, zIndex: 10, elevation: condensed ? 3 : 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
    backgroundColor: condensed ? '#ffffff' : 'transparent', borderBottomWidth: condensed ? 1 : 0, borderColor: '#cdd4d0' }}>
    <View style={{ width: 52, alignItems: 'flex-start' }}>{leading}</View>
    <View style={{ flex: 1, alignItems: 'center' }}>
      {condensed ? <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: '#343d39' }}><Text style={{ color: '#005a36' }}>@</Text>{username}</Text> : null}
    </View>
    <View style={{ width: 52, alignItems: 'flex-end' }}>{trailing}</View>
  </View>
}
