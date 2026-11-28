import { useSyncExternalStore } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/*
 * Estado do teclado compartilhado pelo app: uma só inscrição nos eventos enquanto houver quem o leia. Quem monta no meio
 * de uma animação (a navegação inferior, que volta quando o teclado começa a fechar) lê o último evento; o
 * `Keyboard.isVisible()` do iOS ainda diz "aberto" no `keyboardWillHide` e prenderia a barra sem a área segura.
 * No iOS, os eventos "will" acompanham a animação do teclado; o Android só emite os "did".
 */
let keyboardOpen = false
let keyboardSubscriptions: { remove: () => void }[] | null = null
const keyboardListeners = new Set<() => void>()
function subscribeKeyboard(listener: () => void) {
  keyboardListeners.add(listener)
  if (!keyboardSubscriptions) {
    keyboardOpen = Keyboard.isVisible()
    const set = (open: boolean) => () => { keyboardOpen = open; keyboardListeners.forEach(entry => entry()) }
    keyboardSubscriptions = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', set(true)),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', set(false)),
    ]
  }
  return () => {
    keyboardListeners.delete(listener)
    if (keyboardListeners.size || !keyboardSubscriptions) return
    keyboardSubscriptions.forEach(subscription => subscription.remove())
    keyboardSubscriptions = null
  }
}
/** Sem ninguém inscrito ainda (primeira leitura), pergunta ao sistema: quem monta com o teclado já aberto começa com ele aberto. */
const keyboardSnapshot = () => (keyboardSubscriptions ? keyboardOpen : Keyboard.isVisible())

/** O teclado está aberto? */
export function useKeyboardVisible() {
  return useSyncExternalStore(subscribeKeyboard, keyboardSnapshot, keyboardSnapshot)
}

/**
 * Área segura de baixo para o que fica colado na base da tela (o toast dentro de um `Modal`; o aviso de conexão e o toast
 * acima da navegação usam `useNavSpace`). Com o teclado aberto, o `KeyboardAvoidingView` já empurra tudo até a borda do
 * teclado, e o indicador de início fica embaixo dele: o recuo vira 0 para não sobrar uma faixa vazia acima do teclado.
 */
export function useBottomInset() {
  const { bottom } = useSafeAreaInsets()
  return useKeyboardVisible() ? 0 : bottom
}

/** Navegação inferior com as medidas da web: 82 de altura, com 11 de folga embaixo. */
export const NAV_HEIGHT = 82
export const NAV_PADDING_BOTTOM = 11

/**
 * O que a navegação inferior cresce por causa da área segura de baixo. A folga de 11 da web fica dentro da área segura (o
 * indicador de início) em vez de somar a ela, senão sobra um vão embaixo dos nomes: com 34 de área segura, a barra cresce 23.
 */
export function useNavInset() {
  return navInsetFor(useBottomInset())
}

/** O mesmo cálculo de `useNavInset`, para quem já tem a área segura de baixo em mãos. */
export const navInsetFor = (bottom: number) => Math.max(0, bottom - NAV_PADDING_BOTTOM)

/**
 * Espaço que a navegação inferior ocupa na base da área logada: a barra mais o que ela cresce pela área segura. Com o
 * teclado aberto a barra sai de cena (o `ArenaShell` não a desenha), para o campo em foco e o histórico do chat usarem a
 * altura toda acima do teclado; o espaço vira 0 e a faixa de conexão e os toasts encostam no teclado.
 */
export function useNavSpace() {
  const { bottom } = useSafeAreaInsets()
  return useKeyboardVisible() ? 0 : NAV_HEIGHT + navInsetFor(bottom)
}
