import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Text } from '../Text'
import type { StateTone } from '../../data/arena'
import { colors } from '../../theme'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import type { ThemeColors } from '../../theme'

/*
 * Selo de estado dos protótipos: pílula de 9,5 pt em negrito. `surface="light"` nas listas claras (organizador,
 * comprovantes, administração) e `surface="dark"` sobre o cartaz ou a placa `forest`. Os tons vêm de
 * `eventState`/`entryState` em `data/arena.ts`.
 */
const look = (c: ThemeColors, night: boolean) => ({
  light: {
    draft: { bg: c.subtle, fg: c['ink-muted'] },
    pending: { bg: c['warning-bg'], fg: c.warning },
    open: { bg: c['success-bg'], fg: c.brand },
    live: { bg: colors.forest, fg: colors.mint },
    closed: { bg: night ? '#ffffff14' : 'rgba(73,80,87,0.08)', fg: c['ink-muted'] },
    danger: { bg: night ? '#ff8a8020' : '#fff0f2', fg: c.danger },
  },
  dark: {
    draft: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.7)' },
    pending: { bg: 'rgba(246,194,107,0.15)', fg: colors.amber },
    open: { bg: colors.mint, fg: colors.night },
    live: { bg: 'rgba(143,224,180,0.15)', fg: colors.mint },
    closed: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.55)' },
    danger: { bg: 'rgba(255,138,154,0.15)', fg: '#ffb3bd' },
  },
}) as const satisfies Record<'light' | 'dark', Record<StateTone, { bg: string; fg: string }>>

export interface StateBadgeProps {
  tone: StateTone
  surface?: 'light' | 'dark'
  /**
   * Numa linha só (o cartaz, onde o selo divide a largura com o dia): a letra encolhe até 80% e, se ainda faltar espaço,
   * termina em reticências, sem quebrar em duas linhas nem empurrar os elos de baixo.
   */
  singleLine?: boolean
  children: ReactNode
}

/** Selo de estado (evento, inscrição, comprovante ou decisão). */
export function StateBadge({ tone, surface = 'light', singleLine = false, children }: StateBadgeProps) {
  const colorsOf = look(useThemeColors(), useResolvedTheme() === 'dark')[surface][tone]
  return <View testID={`state-badge-${tone}`} style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colorsOf.bg }}>
    <Text {...(singleLine ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8 } : null)} style={{ color: colorsOf.fg, fontSize: 9.5, fontWeight: '800' }}>{children}</Text>
  </View>
}
