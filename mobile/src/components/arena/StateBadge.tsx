import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { StateTone } from '../../data/arena'
import { colors } from '../../theme'

/*
 * Selo de estado dos protótipos: pílula de 9,5 pt em negrito. `surface="light"` nas listas claras (organizador,
 * comprovantes, administração) e `surface="dark"` sobre o cartaz ou a placa `forest`. Os tons vêm de
 * `eventState`/`entryState` em `data/arena.ts`.
 */
const look = {
  light: {
    draft: { bg: colors.subtle, fg: colors['ink-muted'] },
    pending: { bg: colors['warning-bg'], fg: colors.warning },
    open: { bg: colors['success-bg'], fg: colors.brand },
    live: { bg: colors.forest, fg: colors.mint },
    closed: { bg: 'rgba(73,80,87,0.08)', fg: colors['ink-muted'] },
    danger: { bg: '#fff0f2', fg: colors.danger },
  },
  dark: {
    draft: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.7)' },
    pending: { bg: 'rgba(246,194,107,0.15)', fg: colors.amber },
    open: { bg: colors.mint, fg: colors.night },
    live: { bg: 'rgba(143,224,180,0.15)', fg: colors.mint },
    closed: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.55)' },
    danger: { bg: 'rgba(255,138,154,0.15)', fg: '#ffb3bd' },
  },
} as const satisfies Record<'light' | 'dark', Record<StateTone, { bg: string; fg: string }>>

export interface StateBadgeProps {
  tone: StateTone
  surface?: 'light' | 'dark'
  children: ReactNode
}

/** Selo de estado (evento, inscrição, comprovante ou decisão). */
export function StateBadge({ tone, surface = 'light', children }: StateBadgeProps) {
  const colorsOf = look[surface][tone]
  return <View testID={`state-badge-${tone}`} style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colorsOf.bg }}>
    <Text style={{ color: colorsOf.fg, fontSize: 9.5, fontWeight: '800' }}>{children}</Text>
  </View>
}
