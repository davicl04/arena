import { useCallback, useEffect, useMemo, useState } from 'react'
import { BackHandler } from 'react-native'
import { makeEntry } from './routes'
import type { Entry, ParamsArg, ScreenName, ScreenParams } from './routes'
import { canGoBack, currentOf, initialStack, patchCurrent, pop, push, replaceTop, rootOf } from './stack'
import type { Stack } from './stack'

/** O que as telas recebem para navegar. Os identificadores e parâmetros são tipados por `ScreenParams`. */
export interface Navigation {
  /** Abre `screen`: as abas zeram a pilha e as demais telas empilham (com voltar). */
  go<S extends ScreenName>(screen: S, ...params: ParamsArg<S>): void
  /** Volta uma tela; na raiz de uma aba que não é o Início, volta ao Início. */
  back(): void
  /** Atualiza os parâmetros da tela atual sem empilhar (ex.: time selecionado, pedido de abertura já consumido). */
  setParams<S extends ScreenName>(screen: S, patch: Partial<NonNullable<ScreenParams[S]>>): void
  /** Sai da tela atual para `entry`: substitui a mesma tela logo abaixo (conforme `same`) ou empilha. */
  replace(entry: Entry, same?: (below: Entry) => boolean): void
}

/** Botão voltar do Android: com `enabled`, volta uma tela em vez de sair do app. Modais abertos tratam o botão antes. */
export function useAndroidBack(enabled: boolean, onBack: () => void) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!enabled) return false
      onBack()
      return true
    })
    return () => subscription.remove()
  }, [enabled, onBack])
}

/** Pilha de navegação por estado (sem roteador), com o botão voltar do Android. */
export function useNavigation(initial: () => Stack = initialStack) {
  const [stack, setStack] = useState<Stack>(initial)
  const go = useCallback(<S extends ScreenName>(screen: S, ...params: ParamsArg<S>) => setStack(old => push(old, makeEntry(screen, ...params))), [])
  const back = useCallback(() => setStack(pop), [])
  const setParams = useCallback(<S extends ScreenName>(screen: S, patch: Partial<NonNullable<ScreenParams[S]>>) => setStack(old => patchCurrent(old, screen, patch)), [])
  const replace = useCallback((entry: Entry, same?: (below: Entry) => boolean) => setStack(old => replaceTop(old, entry, same)), [])
  useAndroidBack(canGoBack(stack), back)
  const navigation = useMemo<Navigation>(() => ({ go, back, setParams, replace }), [go, back, setParams, replace])
  return { stack, current: currentOf(stack), root: rootOf(stack), navigation }
}
