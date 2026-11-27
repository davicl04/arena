import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Área segura de baixo para o que fica colado na base da tela (o toast dentro de um `Modal`; a navegação inferior, o aviso
 * de conexão e o toast acima dela usam `useNavInset`, que parte daqui). Com o
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

/** Navegação inferior com as medidas da web: 82 de altura, com 11 de folga embaixo. */
export const NAV_HEIGHT = 82
export const NAV_PADDING_BOTTOM = 11

/**
 * O que a navegação inferior cresce por causa da área segura de baixo. A folga de 11 da web fica dentro da área segura (o
 * indicador de início) em vez de somar a ela, senão sobra um vão embaixo dos nomes: com 34 de área segura, a barra cresce 23.
 * Use também para posicionar o que fica acima da barra (aviso de conexão, toast).
 */
export function useNavInset() {
  return navInsetFor(useBottomInset())
}

/** O mesmo cálculo de `useNavInset`, para quem já tem a área segura de baixo em mãos. */
export const navInsetFor = (bottom: number) => Math.max(0, bottom - NAV_PADDING_BOTTOM)
