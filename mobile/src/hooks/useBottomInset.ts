import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Área segura de baixo para o que fica colado na base da área logada (navegação inferior, toast, aviso de conexão). Com o
 * teclado aberto, o `KeyboardAvoidingView` já empurra tudo até a borda do teclado, e o indicador de início fica embaixo dele:
 * o recuo vira 0 para não sobrar uma faixa vazia entre a barra e o teclado.
 */
export function useBottomInset() {
  const { bottom } = useSafeAreaInsets()
  // Quem monta com o teclado já aberto (o aviso de conexão que aparece no meio da digitação) começa sem o recuo.
  const [keyboard, setKeyboard] = useState(() => Keyboard.isVisible())
  useEffect(() => {
    // No iOS, os eventos "will" acompanham a animação do teclado; o Android só emite os "did".
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  return keyboard ? 0 : bottom
}
