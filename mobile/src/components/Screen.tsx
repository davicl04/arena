import { styled } from 'nativewind'
import { SafeAreaView } from 'react-native-safe-area-context'

/** SafeAreaView com `className`: o componente vem de outra biblioteca e não recebe a classe sem o `styled`. */
export const Screen = styled(SafeAreaView, { className: 'style' })
