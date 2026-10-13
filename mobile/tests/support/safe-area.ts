// Substitui o `react-native-safe-area-context` nos testes (Node, sem Metro): o pacote real usa sintaxe Flow que o Node não lê.
// `SafeAreaView` vira um elemento com o mesmo nome (como `safeAreaMock` em `native.ts`); um teste que chama
// `vi.mock('react-native-safe-area-context', …)` continua trocando por conta própria.
import { safeAreaMock } from './native'

export const { SafeAreaView, useSafeAreaInsets } = safeAreaMock()
export const SafeAreaProvider = ({ children }: { children?: unknown }) => children ?? null
