import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConnection } from '../../api/connection'
import { ToastCard } from './ToastCard'
import { TOAST_LIMIT, toastStore, useToasts } from './toastStore'

/*
 * Onde os toasts aparecem. As folhas do app são `Modal` nativos, que cobrem o resto da tela: um viewport só na raiz
 * ficaria atrás delas. Por isso cada raiz e cada `Modal` monta o seu `<ToastViewport />`, e um contador de profundidade
 * (a ordem de montagem) faz só o mais interno desenhar os toasts; ao fechar a folha, o de baixo assume.
 *
 *   <ToastViewport placement="nav" />      // ArenaShell: 86 pt acima da base, acima da navegação inferior e da faixa de conexão
 *   <ToastViewport placement="screen" />   // sem navegação (tela de entrada): 16 pt da base
 *   <ToastViewport />                      // dentro de um Modal: 16 pt da base mais a área segura
 *
 * O viewport ativo também pausa os temporizadores quando o app vai para segundo plano.
 */
export type ToastPlacement = 'nav' | 'screen' | 'modal'

/** Distância da base com a navegação inferior (altura 82 + folga 4). */
const NAV_OFFSET = 86
/** Altura da faixa de conexão, que empurra o toast para cima. */
const DOCK_HEIGHT = 52
const MARGIN = 16

/* ===== Pilha de viewports montados ===== */

let nextViewport = 0
let mounted: number[] = []
const stackListeners = new Set<() => void>()
const subscribeStack = (listener: () => void) => { stackListeners.add(listener); return () => { stackListeners.delete(listener) } }
const innermost = () => mounted[mounted.length - 1] ?? 0
function setMounted(next: number[]) { mounted = next; stackListeners.forEach(listener => listener()) }

/** Este viewport é o mais interno (o último montado)? */
function useInnermost(): boolean {
  const [id] = useState(() => ++nextViewport)
  useEffect(() => {
    setMounted([...mounted, id])
    return () => setMounted(mounted.filter(entry => entry !== id))
  }, [id])
  return useSyncExternalStore(subscribeStack, innermost, innermost) === id
}

export function ToastViewport({ placement = 'modal' }: { placement?: ToastPlacement }) {
  const active = useInnermost()
  const { toasts } = useToasts()
  const connection = useConnection()
  const insets = useSafeAreaInsets()
  useEffect(() => {
    if (!active) return
    const sync = (state: string | null | undefined) => toastStore.setPaused('app', state !== 'active')
    sync(AppState.currentState)
    const subscription = AppState.addEventListener('change', sync)
    return () => { subscription.remove(); toastStore.setPaused('app', false) }
  }, [active])
  if (!active) return null
  // Os da frente do baralho (até o limite) e os que estão saindo; o resto espera atrás, sem desenhar.
  const standing = toasts.filter(item => !item.ending).slice(-TOAST_LIMIT)
  const shown = toasts.filter(item => item.ending || standing.includes(item))
  if (!shown.length) return null
  const bottom = placement === 'nav' ? NAV_OFFSET + insets.bottom + (connection.status === 'online' ? 0 : DOCK_HEIGHT)
    : placement === 'screen' ? MARGIN : MARGIN + insets.bottom
  return <View testID="toast-viewport" pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom, zIndex: 50, elevation: 50 }}>
    {shown.map(item => <ToastCard key={item.id} item={item} level={item.ending ? 0 : standing.length - 1 - standing.indexOf(item)} />)}
  </View>
}
