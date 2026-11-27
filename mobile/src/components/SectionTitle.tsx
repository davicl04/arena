import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Text } from './Text'

/**
 * Título de seção (o `SectionTitle` da web): `h2` em Sora 700, 16 pt, na cor `heading`, com uma ação opcional à direita.
 * `style` ajusta as margens (padrão: 20 em cima e 11 embaixo, como na web).
 */
export function SectionTitle({ title, action, top = 20, bottom = 11 }: { title: string; action?: ReactNode; top?: number; bottom?: number }) {
  return <View style={{ marginTop: top, marginBottom: bottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <Text accessibilityRole="header" className="shrink text-[16px] text-heading">{title}</Text>
    {action ?? null}
  </View>
}
