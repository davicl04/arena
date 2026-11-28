import type { ReactNode } from 'react'
import {  } from 'react-native'
import { Hint } from '../arena/controls'
import { KeyboardScrollView } from '../KeyboardScrollView'

/** Corpo comum das filas de eventos da administração: dica e a lista com a folha aberta (a confirmação das decisões é um toast). */
export function QueueBody({ hint, children }: { hint: string; children: ReactNode }) {
  return <KeyboardScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
    <Hint>{hint}</Hint>
    {children}
  </KeyboardScrollView>
}
