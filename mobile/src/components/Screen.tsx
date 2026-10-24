import type { ComponentProps } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Edge } from 'react-native-safe-area-context'

const allEdges: readonly Edge[] = ['top', 'right', 'bottom', 'left']

/**
 * Tela com a área segura aplicada como padding, a partir dos insets do `SafeAreaProvider`. Não usa o `SafeAreaView`
 * nativo: dentro do `Modal` do iOS ele não recebe a área segura, e o topo das telas em modal ficava sob a barra de status.
 * `edges` escolhe os lados (a área logada deixa a base para a navegação inferior, que pinta até a borda).
 */
export function Screen({ edges = allEdges, style, ...props }: ComponentProps<typeof View> & { edges?: readonly Edge[] }) {
  const insets = useSafeAreaInsets()
  const pad = (edge: Edge) => edges.includes(edge) ? insets[edge] : 0
  return <View {...props} style={[style, { paddingTop: pad('top'), paddingRight: pad('right'), paddingBottom: pad('bottom'), paddingLeft: pad('left') }]} />
}
