import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import { useThemeColors } from '../../hooks/useTheme'
import { colors as lightColors } from '../../theme'
import type { ThemeColors } from '../../theme'
import { Icon } from '../Icon'

/** `light`: barra clara (Início, Ranking); `dark`: círculo de vidro sobre a placa escura (Jogar, Comunidade); `cover`: sobre a capa do perfil. */
export type BellTone = 'light' | 'dark' | 'cover'

/** Rótulo do sino: "Notificações", "Notificações, 1 nova" ou "Notificações, 5 novas". */
export const bellLabel = (count: number) => count > 0 ? `Notificações, ${count} ${count === 1 ? 'nova' : 'novas'}` : 'Notificações'

/** Vidro escuro dos botões sobre a capa do perfil e a borda dele (o `tone="cover"` da web). */
export const COVER_GLASS = '#0b221859'
export const COVER_GLASS_LINE = '#ffffff2e'

/** Contador do sino: o número, ou "9+" acima de 9. */
export const bellCount = (count: number) => count > 9 ? '9+' : String(count)

const lookOf = (colors: ThemeColors, flat: boolean) => ({
  // Contador verde com anel da cor do fundo (`app`).
  light: { shell: 'transparent', ink: colors.ink, badge: colors.brand, badgeInk: colors['on-brand'], ring: colors.app },
  // Vidro sobre a placa `forest`: contador menta com anel `forest`.
  dark: { shell: 'rgba(255,255,255,0.1)', ink: '#ffffff', badge: colors.mint, badgeInk: colors.night, ring: colors.forest },
  // Vidro escuro sobre a capa (o `IconButton tone="cover"` da web), igual nos dois temas; condensada, a barra é a superfície do tema.
  cover: flat
    ? { shell: lightColors['glass-light'], ink: colors.ink, badge: colors.brand, badgeInk: colors['on-brand'], ring: colors.surface }
    : { shell: COVER_GLASS, ink: '#ffffff', badge: colors.mint, badgeInk: colors.night, ring: '#0b2218' },
}) as const

/**
 * Sino das notificações das abas raiz: botão de 44 pt com o contador de novas (não lidas mais pedidos para seguir). O
 * número fica fora da árvore de acessibilidade porque o rótulo do botão já o diz; com 0 não há contador.
 */
export function NotificationBell({ count, tone, onOpen, condensed = false }: {
  count: number
  tone: BellTone
  onOpen: () => void
  /** Só no `cover`: a barra do perfil já condensada (fundo branco) deixa o botão sem vidro. */
  condensed?: boolean
}) {
  const flat = tone === 'cover' && condensed
  const colorsOf = lookOf(useThemeColors(), flat)[tone]
  return <Pressable accessibilityRole="button" accessibilityLabel={bellLabel(count)} onPress={onOpen}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: flat ? 'transparent' : colorsOf.shell,
      ...(tone === 'cover' && !flat ? { borderWidth: 1, borderColor: COVER_GLASS_LINE } : null) }}>
    <Icon name="bell" size={22} color={colorsOf.ink} />
    {count > 0 ? <View testID="unread-indicator" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 3, right: 1, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 2, borderColor: colorsOf.ring, backgroundColor: colorsOf.badge, paddingHorizontal: 3 }}>
      <Text style={{ color: colorsOf.badgeInk, fontSize: 9.5, fontWeight: '700' }}>{bellCount(count)}</Text>
    </View> : null}
  </Pressable>
}
