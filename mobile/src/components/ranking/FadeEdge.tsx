import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Icon } from '../Icon'

/*
 * Borda esmaecida do Ranking: a próxima linha escondida aparece cortada e apagando na borda, com um botão redondo de vidro com a
 * seta e o número (⌃ 3 / ⌄ 4). Sem `expo-linear-gradient`, o esmaecer é feito em faixas: a mesma linha repetida em fatias
 * horizontais com opacidade decrescente (sem dependência nova e sem depender da cor de fundo da placa). A faixa toda é o botão
 * (44 pt de altura); o nome falado diz quantos há ("Ver 3 times acima").
 */
const HEIGHT = 44
const SLICES = 6
const SLICE = HEIGHT / SLICES
/** Opacidade de cada fatia, da borda visível (perto da janela) à apagada. */
const FADE = [0.55, 0.42, 0.3, 0.2, 0.1, 0.04]

/** Linha de espera da borda quando a próxima página ainda não foi lida (formas neutras, sem dados inventados). */
export function PlaceholderLine() {
  return <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)' }}>
    <View style={{ width: 16, height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' }} />
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)' }} />
    <View style={{ flex: 1, gap: 6 }}>
      <View style={{ width: '55%', height: 10, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' }} />
      <View style={{ width: '35%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' }} />
    </View>
  </View>
}

export function FadeEdge({ side, count, label, onPress, busy = false, children }: {
  /** `up`: as linhas escondidas estão acima da janela; `down`: abaixo. */
  side: 'up' | 'down'
  /** Quantas linhas há além da borda. */
  count: number
  /** Nome falado do botão ("Ver 3 times acima"). */
  label: string
  onPress: () => void
  busy?: boolean
  /** A linha escondida mais próxima (cópia decorativa); sem ela, uma linha de espera. */
  children?: ReactNode
}) {
  const row = children ?? <PlaceholderLine />
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress}
    testID={`fade-edge-${side}`} style={{ height: HEIGHT, overflow: 'hidden', opacity: busy ? 0.6 : 1 }}>
    {FADE.map((opacity, index) => {
      // Da borda visível (junto da janela) à apagada: `down` apaga para baixo, `up` apaga para cima.
      const slot = side === 'down' ? index : SLICES - 1 - index
      const rowTop = side === 'down' ? -slot * SLICE : HEIGHT - 56 - slot * SLICE
      return <View key={index} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, right: 0, top: slot * SLICE, height: SLICE + 0.5, overflow: 'hidden', opacity }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: rowTop }}>{row}</View>
      </View>
    })}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(11,34,24,0.92)', paddingLeft: 7, paddingRight: 11 }}>
        <Icon name={side === 'up' ? 'chevron-up' : 'chevron-down'} size={17} color="#ffffff" />
        <Text style={{ color: '#ffffff', fontSize: 11.5, fontWeight: '700' }}>{count}</Text>
      </View>
    </View>
  </Pressable>
}
