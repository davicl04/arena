// Substitui o `react-native-reanimated` nos testes (Node, sem Metro): o pacote real depende do runtime nativo.
// Os valores compartilhados são objetos simples, `withTiming` e afins devolvem o valor final na hora e os estilos animados
// são calculados na renderização; os testes olham o resultado (conteúdo, papéis, estado), não a animação. Um teste que
// chama `vi.mock('react-native-reanimated', …)` continua trocando por conta própria.
import React, { useState } from 'react'

const element = (name: string) => {
  const Mock = ({ children, ...props }: Record<string, unknown>) => React.createElement(name, props, children as React.ReactNode)
  Mock.displayName = name
  return Mock
}

/** "Reduzir movimento" do sistema: os testes ligam por `motion.reduced = true`. */
export const motion = { reduced: false, cancelled: 0 }
export const useReducedMotion = () => motion.reduced
export interface SharedValue<T> { value: T; get: () => T; set: (next: T) => void }
export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [shared] = useState<SharedValue<T>>(() => {
    const created: SharedValue<T> = { value: initial, get: () => created.value, set: next => { created.value = next } }
    return created
  })
  return shared
}
export const useAnimatedStyle = <T,>(factory: () => T): T => factory()
export const useAnimatedProps = <T,>(factory: () => T): T => factory()
export const withTiming = <T,>(value: T): T => value
export const withRepeat = <T,>(value: T): T => value
export const withDelay = <T,>(_delay: number, value: T): T => value
export const withSequence = <T,>(...values: T[]): T => values[values.length - 1]
export const cancelAnimation = () => { motion.cancelled += 1 }
const identity = (value: unknown) => value
export const Easing = { out: identity, in: identity, inOut: identity, cubic: identity, quad: identity, linear: identity }

const Animated = { View: element('Animated.View'), createAnimatedComponent: <T,>(component: T) => component }
export default Animated
