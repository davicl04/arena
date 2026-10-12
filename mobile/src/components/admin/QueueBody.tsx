import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView } from 'react-native'
import { announce } from '../../utils/announce'
import { Hint, LiveNotice } from '../arena/controls'

/** Corpo comum das filas de eventos da administração: dica, aviso de sucesso e a lista com a folha aberta. */
export function QueueBody({ hint, notice, children }: { hint: string; notice: string; children: ReactNode }) {
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
    <Hint>{hint}</Hint>
    <LiveNotice text={notice} />
    {children}
  </ScrollView>
}

/** Aviso de sucesso da fila: aparece na região viva e é anunciado no iOS; `clear` o limpa ao abrir outro item. */
export function useNotice() {
  const [notice, setNotice] = useState('')
  const say = useCallback((text: string) => { setNotice(text); announce(text) }, [])
  const clear = useCallback(() => setNotice(''), [])
  return { notice, say, clear }
}
