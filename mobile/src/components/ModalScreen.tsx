import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomInset } from '../hooks/useBottomInset'
import { useResolvedTheme } from '../hooks/useTheme'

/**
 * Contêiner das telas em `Modal` de tela cheia. O `SafeAreaView` (`Screen`) devolve margem 0 dentro do `Modal` no iOS, e o
 * cabeçalho ficaria sob a barra de status; aqui o recuo vem de `useSafeAreaInsets()`, como no `ShareStoryModal`.
 * Embaixo usa `useBottomInset`, que vira 0 com o teclado aberto (o `KeyboardAvoidingView` já leva o conteúdo até ele).
 * No Android, o `Modal` precisa de `statusBarTranslucent` e `navigationBarTranslucent` para a janela dele ir de borda a borda
 * como a do app; senão estes recuos somariam aos que a janela do modal já reserva.
 * `dark` marca as telas escuras por design (ícones da barra de status claros nos dois temas); as demais seguem o tema.
 */
export function ModalScreen({ className, style, edges = ['top', 'bottom'], dark = false, children }: {
  className?: string
  style?: StyleProp<ViewStyle>
  /** Bordas que recebem o recuo da área segura (padrão: topo e base). */
  edges?: ('top' | 'bottom')[]
  dark?: boolean
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const bottom = useBottomInset()
  const theme = useResolvedTheme()
  const barStyle = dark || theme === 'dark' ? 'light' : 'dark'
  return <View className={className} style={[{ flex: 1, paddingTop: edges.includes('top') ? insets.top : 0, paddingBottom: edges.includes('bottom') ? bottom : 0 }, style]}>
    <StatusBar style={barStyle} />
    {children}
  </View>
}
