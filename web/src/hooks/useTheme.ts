import { useSyncExternalStore } from 'react'

/*
 * Tema claro e escuro (docs/plano-tema.md). A preferência fica no aparelho (`localStorage`, chave `arena.tema`), não na
 * conta: `light` (Dia), `dark` (Noite) ou `system` (Automático, o padrão). O tema resolvido vai para `<html>` como
 * `data-theme`, `color-scheme` e `<meta name="theme-color">`. O script em linha do `index.html` faz o mesmo antes da
 * primeira pintura; este módulo mantém o estado, grava a escolha e acompanha o sistema ao vivo (`matchMedia`).
 * Leituras e escritas do armazenamento ficam em `try/catch`: sem ele, vale o sistema e nada quebra.
 */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type ThemeState = { preference: ThemePreference; resolved: ResolvedTheme }

export const THEME_STORAGE_KEY = 'arena.tema'
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#005a36', dark: '#040806' }
/** Duração da classe `theme-transition` em `<html>` (a transição de cor dura 280 ms). */
export const THEME_TRANSITION_MS = 300
const DARK_QUERY = '(prefers-color-scheme: dark)'

const isPreference = (value: unknown): value is ThemePreference => value === 'light' || value === 'dark' || value === 'system'

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

/** Loja do tema para uma janela (a do app é `themeStore`; os testes criam a sua). */
export function createThemeStore(win: Window = window) {
  const query = (() => {
    try { return win.matchMedia?.(DARK_QUERY) ?? null } catch { return null }
  })()
  const readPreference = (): ThemePreference => {
    try {
      const value = win.localStorage.getItem(THEME_STORAGE_KEY)
      return isPreference(value) ? value : 'system'
    } catch {
      return 'system'
    }
  }
  let preference = readPreference()
  let systemDark = Boolean(query?.matches)
  let state: ThemeState = { preference, resolved: resolveTheme(preference, systemDark) }
  const listeners = new Set<() => void>()
  let transitionTimer: ReturnType<typeof setTimeout> | undefined

  const apply = (animate: boolean) => {
    const root = win.document.documentElement
    const reduce = (() => {
      try { return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { return false }
    })()
    if (animate && !reduce && root.dataset.theme !== state.resolved) {
      root.classList.add('theme-transition')
      clearTimeout(transitionTimer)
      transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), THEME_TRANSITION_MS)
    }
    root.dataset.theme = state.resolved
    root.style.colorScheme = state.resolved
    win.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[state.resolved])
  }

  const update = (animate: boolean) => {
    const resolved = resolveTheme(preference, systemDark)
    if (state.preference !== preference || state.resolved !== resolved) state = { preference, resolved }
    apply(animate)
    listeners.forEach((listener) => listener())
  }

  const onSystemChange = (event: MediaQueryListEvent) => {
    systemDark = event.matches
    update(false)
  }

  return {
    getState: () => state,
    /** Troca a preferência (pelo cartão Aparência): grava, aplica na hora e anima a troca de cor. */
    setPreference(next: ThemePreference) {
      preference = next
      try { win.localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* sem armazenamento: vale só nesta sessão */ }
      update(true)
    },
    subscribe(listener: () => void) {
      if (listeners.size === 0) {
        query?.addEventListener?.('change', onSystemChange)
        apply(false)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) query?.removeEventListener?.('change', onSystemChange)
      }
    },
  }
}

export type ThemeStore = ReturnType<typeof createThemeStore>

let appStore: ThemeStore | null = null
/** A loja do app (criada no primeiro uso). */
export const themeStore = () => (appStore ??= createThemeStore())

/** Liga o app ao tema desde a carga: aplica o resolvido e passa a acompanhar o sistema (Automático) ao vivo. */
export function startThemeSync() {
  return themeStore().subscribe(() => {})
}

/** Preferência, tema resolvido e a troca. A loja é única no app; `store` serve aos testes. */
export function useTheme(store: ThemeStore = themeStore()) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  return { ...state, setPreference: store.setPreference }
}
