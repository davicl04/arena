import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { positions } from '../../api/client'
import type { Position } from '../../api/client'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import type { ChoiceOption } from '../arena/controls'
import { positionAbbreviation } from './format'

/** Posições como escolhas em pílulas: a sigla (GOL, DEF, MEI, ATA) na pílula e o nome completo para leitores de tela. */
export const positionChoices: ChoiceOption<Position>[] = positions.map(item => ({ value: item.value, label: positionAbbreviation[item.value], accessibilityLabel: item.label }))

/** Cartão branco do resultado (placar, estatísticas): cantos de 16 pt, 14 pt de respiro e 12 pt entre os blocos. */
export function ResultCard({ children, testID }: { children: ReactNode; testID?: string }) {
  return <View testID={testID} style={{ gap: 12, borderRadius: 16, backgroundColor: '#ffffff', padding: 14 }}>{children}</View>
}

/** Título do cartão: ícone verde, o título como cabeçalho e, à direita, um resumo ou selo. */
export function CardTitle({ icon, title, trailing }: { icon: IconName; title: string; trailing?: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name={icon} size={16} color={colors.brand} /></View>
    <Text accessibilityRole="header" style={{ flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }}>{title}</Text>
    {trailing ? <View style={{ marginLeft: 'auto', flexShrink: 1 }}>{trailing}</View> : null}
  </View>
}

/** Texto pequeno e esmaecido dos cartões (avisos, legendas). */
export function Muted({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warning' }) {
  return <Text style={{ color: tone === 'warning' ? colors.warning : colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>{children}</Text>
}

/** Rótulo em caixa alta de um grupo de campos ("Posição em que você jogou"). */
export function Eyebrow({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={{ color: colors['ink-muted'], fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</Text>
}
