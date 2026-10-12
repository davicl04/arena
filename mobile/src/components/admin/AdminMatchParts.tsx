import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

/**
 * Linha das filas de quadras e de W.O. (porta de `TileRow` da web): quadro `forest` com o ícone menta, título, linhas de
 * apoio, selo e chevron. Com `onOpen` é um botão de 64 pt ou mais que abre a folha; sem ele (fila "Decididas"), um cartão
 * de leitura. `status` é o texto do selo, lido junto com a linha.
 */
export function TileRow({ icon, title, lines, badge, status, onOpen }: {
  icon: IconName
  title: string
  lines: string[]
  badge?: ReactNode
  status?: string
  onOpen?: () => void
}) {
  const label = [title, ...lines, status].filter(Boolean).join('. ')
  const box = { minHeight: 64, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, borderRadius: 16, backgroundColor: '#ffffff', padding: 10 }
  const content = <>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.forest }}>
      <Icon name={icon} size={21} color={colors.mint} />
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
      {lines.map((line, index) => <Text key={index} style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{line}</Text>)}
      {badge}
    </View>
    {onOpen ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="chevron" size={18} color={colors['ink-muted']} /></View> : null}
  </>
  return onOpen
    ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen} style={box}>{content}</Pressable>
    : <View accessible accessibilityLabel={label} style={box}>{content}</View>
}
