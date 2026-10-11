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
    ActivityIndicator: element('ActivityIndicator'), Alert: { alert: vi.fn() }, Animated, FlatList, Image: element('Image'), KeyboardAvoidingView: element('KeyboardAvoidingView'),
    Modal: element('Modal'), Platform: { OS: 'android' }, Pressable: element('Pressable'), RefreshControl: element('RefreshControl'), ScrollView: element('ScrollView'),
    Text: element('Text'), TextInput: element('TextInput'), View: element('View'), useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
  }
}

export const safeAreaMock = () => ({ SafeAreaView: element('SafeAreaView') })

export const uiMock = () => ({
  Button: ({ title, ...props }: Record<string, unknown>) => React.createElement('Button', { ...props, title }, title as React.ReactNode),
  Field: ({ label, ...props }: Record<string, unknown>) => React.createElement('TextInput', { ...props, accessibilityLabel: label }),
})

export const enableAct = () => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true }

// Junta só os textos primitivos de cada <Text>; textos aninhados são encontrados por conta própria.
const strings = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(strings) : typeof value === 'string' || typeof value === 'number' ? [String(value)] : []
export const textOf = (tree: ReactTestRenderer) => tree.root.findAllByType('Text' as never).map(entry => strings(entry.props.children).join('')).join(' | ')
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
