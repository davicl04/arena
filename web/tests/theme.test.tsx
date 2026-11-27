import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppearanceCard } from '../src/components/menu/AppearanceCard'
import { appearanceTitle } from '../src/components/menu/appearance'
import SportIcon from '../src/components/SportIcon'
import { THEME_STORAGE_KEY, createThemeStore, resolveTheme, themeStore } from '../src/hooks/useTheme'

/** matchMedia falso: `dark` controla `(prefers-color-scheme: dark)` e `emit` simula a troca do sistema. */
function fakeMedia(initialDark: boolean) {
  let dark = initialDark
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const matchMedia = vi.fn((query: string) => ({
    get matches() { return query.includes('prefers-color-scheme: dark') ? dark : false },
    media: query,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  }))
  return {
    matchMedia,
    emit(next: boolean) {
      dark = next
      listeners.forEach(listener => listener({ matches: next } as MediaQueryListEvent))
    },
    listenerCount: () => listeners.size,
  }
}

const root = document.documentElement

/** Armazenamento em memória (o `localStorage` global do Node não é o do jsdom). */
function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, String(value)) },
    removeItem: (key: string) => { items.delete(key) },
    clear: () => items.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  root.removeAttribute('data-theme')
  root.style.colorScheme = ''
  root.classList.remove('theme-transition')
  document.head.innerHTML = '<meta name="theme-color" content="#005a36" />'
})
afterEach(() => cleanup())

describe('tema', () => {
  it('resolve o Automático pelo sistema', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('segue o sistema sem preferência salva e acompanha a troca ao vivo', () => {
    const media = fakeMedia(true)
    vi.stubGlobal('matchMedia', media.matchMedia)
    const store = createThemeStore(window)
    expect(store.getState()).toEqual({ preference: 'system', resolved: 'dark' })
    const stop = store.subscribe(() => {})
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#040806')
    media.emit(false)
    expect(store.getState().resolved).toBe('light')
    expect(root.dataset.theme).toBe('light')
    // A troca pelo sistema não anima.
    expect(root.classList.contains('theme-transition')).toBe(false)
    stop()
    expect(media.listenerCount()).toBe(0)
  })

  it('lê e grava a preferência em arena.tema', () => {
    vi.stubGlobal('matchMedia', fakeMedia(false).matchMedia)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const store = createThemeStore(window)
    expect(store.getState()).toEqual({ preference: 'dark', resolved: 'dark' })
    store.setPreference('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(createThemeStore(window).getState().preference).toBe('light')
  })

  it('ignora valor inválido salvo', () => {
    vi.stubGlobal('matchMedia', fakeMedia(false).matchMedia)
    localStorage.setItem(THEME_STORAGE_KEY, 'roxo')
    expect(createThemeStore(window).getState()).toEqual({ preference: 'system', resolved: 'light' })
  })

  it('funciona sem armazenamento e sem matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    const failing = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    const win = { localStorage: failing, document, matchMedia: undefined } as unknown as Window
    const store = createThemeStore(win)
    expect(store.getState()).toEqual({ preference: 'system', resolved: 'light' })
    expect(() => store.setPreference('dark')).not.toThrow()
    expect(store.getState().resolved).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })

  it('anima só a troca feita pelo cartão e respeita a redução de movimento', () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('matchMedia', fakeMedia(false).matchMedia)
      const store = createThemeStore(window)
      store.subscribe(() => {})
      store.setPreference('dark')
      expect(root.classList.contains('theme-transition')).toBe(true)
      vi.advanceTimersByTime(300)
      expect(root.classList.contains('theme-transition')).toBe(false)

      const reduced = vi.fn((query: string) => ({ matches: query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }))
      vi.stubGlobal('matchMedia', reduced)
      createThemeStore(window).setPreference('light')
      expect(root.dataset.theme).toBe('light')
      expect(root.classList.contains('theme-transition')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra o título certo nos três casos', () => {
    expect(appearanceTitle('light', 'light')).toBe('Jogo de dia')
    expect(appearanceTitle('dark', 'dark')).toBe('Jogo à noite')
    expect(appearanceTitle('system', 'dark')).toBe('Automático · noite agora')
    expect(appearanceTitle('system', 'light')).toBe('Automático · dia agora')
  })

  it('o cartão Aparência marca a opção e troca o tema na hora', async () => {
    const media = fakeMedia(false)
    vi.stubGlobal('matchMedia', media.matchMedia)
    const store = createThemeStore(window)
    render(<AppearanceCard store={store} />)
    const card = screen.getByRole('region', { name: 'Automático · dia agora' })
    const group = within(card).getByRole('group', { name: 'Tema' })
    expect(within(group).getByRole('button', { name: 'Automático' }).getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(within(group).getByRole('button', { name: 'Noite' }))
    expect(within(group).getByRole('button', { name: 'Noite' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: 'Automático' }).getAttribute('aria-pressed')).toBe('false')
    expect(root.dataset.theme).toBe('dark')
    expect(card.hasAttribute('data-lit')).toBe(true)
    screen.getByText('Jogo à noite')

    await userEvent.click(within(group).getByRole('button', { name: 'Dia' }))
    expect(root.dataset.theme).toBe('light')
    expect(card.hasAttribute('data-lit')).toBe(false)
    screen.getByText('Jogo de dia')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    await userEvent.click(within(group).getByRole('button', { name: 'Automático' }))
    act(() => media.emit(true))
    screen.getByText('Automático · noite agora')
    expect(root.dataset.theme).toBe('dark')
  })

  it('o selo de modalidade é vetorial e muda de cor com o tema pelos tokens, sem PNG e sem renderizar de novo', () => {
    vi.stubGlobal('matchMedia', fakeMedia(false).matchMedia)
    // Os valores dos tokens do selo como `ui.css` os define no claro (`@theme`) e no escuro (o bloco do tema escuro).
    const css = readFileSync(join(process.cwd(), 'src', 'ui.css'), 'utf8')
    const token = (block: string, name: string) => block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim()
    const darkStart = css.indexOf(':root[data-theme="dark"],\n.escuro-por-design {')
    const light = css.slice(css.indexOf('@theme static'), darkStart)
    const dark = css.slice(darkStart)
    const style = document.createElement('style')
    style.textContent = `:root { --color-selo-disco: ${token(light, 'selo-disco')}; --color-selo-detalhe: ${token(light, 'selo-detalhe')}; }
      :root[data-theme="dark"] { --color-selo-disco: ${token(dark, 'selo-disco')}; --color-selo-detalhe: ${token(dark, 'selo-detalhe')}; }`
    document.head.append(style)
    const { container } = render(<SportIcon sport="tenis" forma="selo" size={30} />)
    const icon = container.querySelector<SVGElement>('[data-slot="sport-icon"]')!
    const colors = () => {
      const computed = getComputedStyle(icon)
      return [computed.getPropertyValue('--color-selo-disco').trim(), computed.getPropertyValue('--color-selo-detalhe').trim()]
    }
    act(() => themeStore().setPreference('light'))
    const markup = container.innerHTML
    expect(colors()).toEqual(['#153a2b', '#fff'])
    act(() => themeStore().setPreference('dark'))
    expect(colors()).toEqual(['#16201b', '#f4de9a'])
    // A cor vem só do CSS: o SVG é o mesmo nos dois temas (nada a trocar depois da pintura) e não há PNG nem máscara.
    expect(container.innerHTML).toBe(markup)
    expect(icon.querySelector('circle')?.getAttribute('class')).toContain('fill-selo-disco')
    expect(icon.querySelector('g')?.getAttribute('class')).toContain('fill-selo-detalhe')
    expect(container.querySelector('img')).toBeNull()
    expect(markup).not.toMatch(/\.png|mask/)
    style.remove()
    act(() => themeStore().setPreference('system'))
  })
})
