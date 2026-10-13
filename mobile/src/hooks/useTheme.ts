import { useSyncExternalStore } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { darkColors, lightColors } from '../theme'
import type { ThemeColors } from '../theme'

/*
 * Tema claro e escuro (docs/plano-tema.md). A preferência fica no aparelho (SecureStore, chave `arena.tema`), não na conta:
 * `light` (Dia), `dark` (Noite) ou `system` (Automático, o padrão). Ela chega ao app por `Appearance.setColorScheme`, que
 * muda o `useColorScheme()` do React Native e a media query `prefers-color-scheme` das classes do NativeWind (global.css).
 * Enquanto a leitura do SecureStore não termina, vale o sistema; falhas de leitura e gravação não quebram nada.
 */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'arena.tema'

const isPreference = (value: unknown): value is ThemePreference => value === 'light' || value === 'dark' || value === 'system'

let preference: ThemePreference = 'system'
const listeners = new Set<() => void>()

function apply() {
  try { Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference) } catch { /* sem módulo nativo */ }
}
function notify() { listeners.forEach(listener => listener()) }

export const themeStore = {
  getPreference: () => preference,
  /** Lê a preferência salva e a aplica (chamado uma vez, na abertura do app). */
  async load() {
    try {
      const saved = await SecureStore.getItemAsync(THEME_STORAGE_KEY)
      if (isPreference(saved)) preference = saved
    } catch { /* sem armazenamento: segue o sistema */ }
    apply()
    notify()
  },
  /** Troca a preferência (cartão Aparência): aplica na hora e grava no aparelho. */
  setPreference(next: ThemePreference) {
    preference = next
    apply()
    notify()
    SecureStore.setItemAsync(THEME_STORAGE_KEY, next).catch(() => { /* vale só nesta sessão */ })
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  /** Testes: volta ao padrão. */
  reset() { preference = 'system'; listeners.clear() },
}

/** Tema resolvido: o escolhido ou, no Automático, o do sistema (acompanha a troca ao vivo). */
export function useResolvedTheme(): ResolvedTheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light'
}

/** Cores do tema resolvido, para props de cor e estilos em `style` (as classes do NativeWind já trocam sozinhas). */
export function useThemeColors(): ThemeColors {
  return useResolvedTheme() === 'dark' ? darkColors : lightColors
}

/** Preferência, tema resolvido e a troca (cartão Aparência). */
export function useTheme() {
  const current = useSyncExternalStore(themeStore.subscribe, themeStore.getPreference, themeStore.getPreference)
  return { preference: current, resolved: useResolvedTheme(), setPreference: themeStore.setPreference }
}
