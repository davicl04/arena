import type { ResolvedTheme, ThemePreference } from '../../hooks/useTheme'

/** Título do cartão Aparência: o tema escolhido ou, no Automático, o que o sistema pede agora (o mesmo da web). */
export function appearanceTitle(preference: ThemePreference, resolved: ResolvedTheme) {
  if (preference === 'system') return `Automático · ${resolved === 'dark' ? 'noite' : 'dia'} agora`
  return preference === 'dark' ? 'Jogo à noite' : 'Jogo de dia'
}
