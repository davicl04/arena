import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

/** Trecho em negrito dentro de um texto (`<b>` dos protótipos). */
export function Strong({ children }: { children: ReactNode }) {
  return <Text style={{ fontWeight: '700' }}>{children}</Text>
}

/** Trecho secundário, menor e em cinza (`<small>` dos protótipos). */
export function Muted({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 10, color: colors['ink-muted'] }}>{children}</Text>
}

/**
 * Linha de dado (`.term` dos protótipos): ícone verde, texto e, opcionalmente, uma ação à direita. O ícone é
 * decorativo; o texto da linha diz tudo a leitores de tela.
 */
export function Term({ icon, iconNode, children, action }: {
  icon?: IconName
  /** Nó no lugar do ícone (ex.: os elos aceitos). */
  iconNode?: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ minWidth: 17, alignItems: 'center' }}>
      {iconNode ?? (icon ? <Icon name={icon} size={17} color={colors.brand} /> : null)}
    </View>
    <Text style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{children}</Text>
    {action}
  </View>
}
