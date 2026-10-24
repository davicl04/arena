import React from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { expect, vi } from 'vitest'

// Mocks compartilhados pelos testes de componentes: cada componente nativo vira um elemento com o mesmo nome.
const element = (name: string) => {
  const Mock = ({ children, ...props }: Record<string, unknown>) => React.createElement(name, props, children as React.ReactNode)
  Mock.displayName = name
  return Mock
}
const renderComponent = (value: unknown) => React.isValidElement(value) ? value : value ? React.createElement(value as React.ElementType) : null

// Animated sem driver: valores e interpolações são inertes; as animações só registram start/stop.
class AnimatedValue {
  constructor(public value = 0) {}
  interpolate() { return this }
  setValue(value: number) { this.value = value }
}
const animation = () => ({ start: () => undefined, stop: () => undefined })

// Botão voltar do Android e links do sistema: os testes os acionam por `hardwareBack.press()` e `linking.emit(url)`.
export const hardwareBack = {
  handlers: [] as (() => boolean | null | undefined)[],
  /** Dispara o botão voltar como o Android: o último ouvinte registrado que devolve `true` consome o toque. */
  press() { for (const handler of [...this.handlers].reverse()) if (handler()) return true; return false },
}
export const linking = {
  initial: null as string | null,
  listeners: [] as ((event: { url: string }) => void)[],
  emit(url: string) { for (const listener of [...this.listeners]) listener({ url }) },
}

// Estado do app (primeiro plano ou segundo plano): os testes mudam o estado por `appState.set('background')`, que avisa os ouvintes.
export const appState = {
  current: 'active' as string,
  listeners: [] as ((state: string) => void)[],
  /** Muda o estado do app e avisa quem ouve, como o sistema ao ir para o segundo plano e voltar. */
  set(state: string) { this.current = state; for (const listener of [...this.listeners]) listener(state) },
  reset() { this.current = 'active'; this.listeners.length = 0 },
}
// Arrastar o toast: cada `PanResponder.create` registra a configuração; o teste chama `panResponder.last().onPanResponderMove(…)`.
export const panResponder = {
  configs: [] as Record<string, (...args: any[]) => any>[],
  last() { return this.configs[this.configs.length - 1] },
  reset() { this.configs.length = 0 },
}
// Leitor de tela: os anúncios ficam em `accessibility.announcements`.
export const accessibility = {
  announcements: [] as string[],
}

// Esquema de cores: `appearance.setSystem('dark')` simula a troca do sistema; `Appearance.setColorScheme` grava a escolha do app.
export const appearance = {
  system: 'light' as 'light' | 'dark',
  override: null as 'light' | 'dark' | null,
  listeners: [] as ((preferences: { colorScheme: 'light' | 'dark' }) => void)[],
  get scheme() { return this.override ?? this.system },
  emit() { for (const listener of [...this.listeners]) listener({ colorScheme: this.scheme }) },
  setSystem(scheme: 'light' | 'dark') { this.system = scheme; this.emit() },
  reset() { this.system = 'light'; this.override = null; this.listeners.length = 0 },
}
const subscribeAppearance = (listener: () => void) => {
  appearance.listeners.push(listener)
  return () => { appearance.listeners.splice(appearance.listeners.indexOf(listener), 1) }
}

export function reactNativeMock() {
  const FlatList = ({ data = [], renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ...props }: Record<string, any>) => React.createElement('FlatList', props,
    renderComponent(ListHeaderComponent),
    data.length ? data.map((item: unknown, index: number) => React.createElement(React.Fragment, { key: index }, renderItem({ item, index }))) : renderComponent(ListEmptyComponent),
    renderComponent(ListFooterComponent))
  const Animated = {
    Value: AnimatedValue, View: element('Animated.View'), FlatList, event: () => () => undefined, diffClamp: (value: AnimatedValue) => value,
    timing: animation, loop: animation,
  }
  return {
    AccessibilityInfo: { announceForAccessibility: (message: string) => { accessibility.announcements.push(message) } },
    AppState: {
      get currentState() { return appState.current },
      addEventListener: (_event: string, listener: (state: string) => void) => {
        appState.listeners.push(listener)
        return { remove: () => { appState.listeners.splice(appState.listeners.indexOf(listener), 1) } }
      },
    },
    ActivityIndicator: element('ActivityIndicator'), Alert: { alert: vi.fn() }, Animated, FlatList, Image: element('Image'), KeyboardAvoidingView: element('KeyboardAvoidingView'),
    BackHandler: {
      addEventListener: (_event: string, handler: () => boolean | null | undefined) => {
        hardwareBack.handlers.push(handler)
        return { remove: () => { hardwareBack.handlers.splice(hardwareBack.handlers.indexOf(handler), 1) } }
      },
    },
    Linking: {
      getInitialURL: async () => linking.initial,
      addEventListener: (_event: string, listener: (event: { url: string }) => void) => {
        linking.listeners.push(listener)
        return { remove: () => { linking.listeners.splice(linking.listeners.indexOf(listener), 1) } }
      },
    },
    Share: { share: vi.fn(), sharedAction: 'sharedAction', dismissedAction: 'dismissedAction' },
    PanResponder: { create: (config: Record<string, (...args: any[]) => any>) => { panResponder.configs.push(config); return { panHandlers: {} } } },
    Modal: element('Modal'), Platform: { OS: 'android' }, Pressable: element('Pressable'), RefreshControl: element('RefreshControl'), ScrollView: element('ScrollView'),
    Text: element('Text'), TextInput: element('TextInput'), View: element('View'), useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
    Appearance: {
      getColorScheme: () => appearance.scheme,
      setColorScheme: (scheme: string | null) => { appearance.override = scheme === 'light' || scheme === 'dark' ? scheme : null; appearance.emit() },
      addChangeListener: (listener: () => void) => ({ remove: subscribeAppearance(listener) }),
    },
    useColorScheme: () => React.useSyncExternalStore(subscribeAppearance, () => appearance.scheme),
  }
}

/** react-native-svg: cada forma vira um elemento com o mesmo nome (o `Text` do SVG é `SvgText`, para não colidir com o do RN). */
export const svgMock = () => {
  const Svg = element('Svg')
  return {
    __esModule: true, default: Svg, Svg, SvgXml: element('SvgXml'), Circle: element('Circle'), Path: element('Path'), Rect: element('Rect'), Text: element('SvgText'),
    Defs: element('Defs'), LinearGradient: element('LinearGradient'), Stop: element('Stop'),
  }
}

export const safeAreaMock = () => ({ SafeAreaView: element('SafeAreaView'), useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) })

export const uiMock = () => ({
  Button: ({ title, ...props }: Record<string, unknown>) => React.createElement('Button', { ...props, title }, title as React.ReactNode),
  Field: ({ label, ...props }: Record<string, unknown>) => React.createElement('TextInput', { ...props, accessibilityLabel: label }),
})

export const enableAct = () => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true }

// Junta só os textos primitivos de cada <Text>; textos aninhados são encontrados por conta própria.
const strings = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(strings) : typeof value === 'string' || typeof value === 'number' ? [String(value)] : []
export const textOf = (tree: ReactTestRenderer) => tree.root.findAllByType('Text' as never).map(entry => strings(entry.props.children).join('')).join(' | ')
/** Barra de uma tela que desenha a própria (placa escura): o Voltar e o título que o shell não mostra para ela. */
export const ownBar = (title: string, onBack: () => void) => React.createElement('View', null,
  React.createElement('Pressable', { accessibilityRole: 'button', accessibilityLabel: 'Voltar', onPress: onBack }),
  React.createElement('Text', null, title))
export const byLabel = (tree: ReactTestRenderer, label: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label)
export const button = (tree: ReactTestRenderer, title: string) => tree.root.findAllByType('Button' as never).find(entry => entry.props.title === title)

export async function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === label).pop()
  expect(target, `Pressable "${label}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}

export async function click(tree: ReactTestRenderer, title: string) {
  const target = button(tree, title)
  expect(target, `Button "${title}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}

export async function type(tree: ReactTestRenderer, label: string, value: string) {
  const input = tree.root.findAllByType('TextInput' as never).find(entry => entry.props.accessibilityLabel === label)
  expect(input, `TextInput "${label}"`).toBeTruthy()
  await act(async () => { input!.props.onChangeText(value) })
}

/** Abre a aba Atletas (se preciso), digita na busca da barra escura e vence o debounce. */
export async function searchAthletes(tree: ReactTestRenderer, term: string) {
  vi.useFakeTimers()
  try {
    if (!byLabel(tree, 'Buscar atletas por nome ou @').length) await press(tree, 'Atletas')
    await type(tree, 'Buscar atletas por nome ou @', term)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  } finally { vi.useRealTimers() }
}
