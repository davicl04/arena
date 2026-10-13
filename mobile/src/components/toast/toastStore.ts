import { useSyncExternalStore } from 'react'

/*
 * Loja dos toasts ARENA no Expo (mesma API da web, `components/ui/toast.tsx`): resultado passageiro de uma ação, na base
 * da tela, acima da navegação inferior. Chame de qualquer lugar (componente, hook, cliente da API):
 *
 *   toast.success('Perfil salvo.')
 *   toast.warning('Vaga reservada.', { description: 'Envie o comprovante.', action: { label: 'Enviar', onClick } })
 *   toast.error(mensagemDoServidor)      // fica até ser fechado
 *
 * A loja guarda a lista, os temporizadores e a pausa; o `ToastViewport` desenha. Pausam o tempo, somados: o app em segundo
 * plano (`'app'`) e o toque ou arrasto sobre um toast (`'touch'`). Sem nenhum `ToastViewport` montado, a chamada não
 * aparece, mas o toast segue a vida normal (some no fim do tempo).
 */
export type ToastTone = 'success' | 'info' | 'warning' | 'error'
export interface ToastAction { label: string; onClick: () => void }
export interface ToastOptions {
  description?: string
  /** No máximo uma ação, em pílula na cor do tom. */
  action?: ToastAction
  /** Repetir o id atualiza o toast que já está na tela (e renova o tempo) em vez de empilhar outro. */
  id?: string
}

/** Tempo de exibição por tom, em ms. `0` = fica até ser fechado (o erro). Único lugar que define as durações. */
export const TOAST_DURATION: Record<ToastTone, number> = { success: 4000, info: 5000, warning: 7000, error: 0 }
/** Máximo de toasts no baralho; os mais antigos ficam guardados atrás e voltam quando os da frente saem. */
export const TOAST_LIMIT = 4
/** Tempo da saída animada: o toast fica na lista, `ending`, até acabar. */
export const TOAST_EXIT_MS = 240

export type PauseReason = 'app' | 'touch'

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  description?: string
  action?: ToastAction
  /** Duração total do tom, em ms (`0` = sem expiração). */
  duration: number
  /** Quanto falta, em ms, desde `runningSince` (ou o que sobrou da pausa quando `runningSince` é `null`). Só vale com `duration > 0`. */
  remaining: number
  /** Instante em que o tempo voltou a correr; `null` com o tempo pausado ou no erro. O anel acompanha estes dois campos. */
  runningSince: number | null
  /** Sobe a cada atualização por id, para o cartão reiniciar o anel e a animação. */
  updateKey: number
  /** Está saindo (animação de saída); já não conta para o baralho. */
  ending: boolean
}

export interface ToastState {
  /** Do mais antigo ao mais novo (o último é o da frente). */
  toasts: readonly ToastItem[]
  /** Tempo parado por algum motivo. */
  paused: boolean
}

const initial: ToastState = { toasts: [], paused: false }

export interface ToastStore {
  getState: () => ToastState
  subscribe: (listener: () => void) => () => void
  add: (tone: ToastTone, title: string, options?: ToastOptions) => string
  /** Dispensa um toast pelo id, ou todos sem argumento. A saída é animada. */
  dismiss: (id?: string) => void
  setPaused: (reason: PauseReason, paused: boolean) => void
  /** Volta ao estado inicial e cancela os temporizadores (testes). */
  reset: () => void
}

export function createToastStore(): ToastStore {
  let state: ToastState = initial
  let counter = 0
  const listeners = new Set<() => void>()
  const expiry = new Map<string, ReturnType<typeof setTimeout>>()
  const exits = new Map<string, ReturnType<typeof setTimeout>>()
  const reasons = new Set<PauseReason>()

  function set(next: ToastState) {
    state = next
    listeners.forEach(listener => listener())
  }
  function clearTimer(timers: Map<string, ReturnType<typeof setTimeout>>, id: string) {
    clearTimeout(timers.get(id))
    timers.delete(id)
  }
  /** Marca como saindo e tira da lista quando a saída acaba. */
  function end(id: string) {
    const item = state.toasts.find(entry => entry.id === id)
    if (!item || item.ending) return
    clearTimer(expiry, id)
    set({ ...state, toasts: state.toasts.map(entry => entry.id === id ? { ...entry, ending: true, runningSince: null } : entry) })
    exits.set(id, setTimeout(() => {
      exits.delete(id)
      set({ ...state, toasts: state.toasts.filter(entry => entry.id !== id) })
    }, TOAST_EXIT_MS))
  }
  function arm(item: ToastItem) {
    clearTimer(expiry, item.id)
    if (item.duration > 0 && item.runningSince !== null) expiry.set(item.id, setTimeout(() => end(item.id), item.remaining))
  }

  function add(tone: ToastTone, title: string, options: ToastOptions = {}): string {
    const duration = TOAST_DURATION[tone]
    const id = options.id ?? `toast-${++counter}`
    const old = state.toasts.find(entry => entry.id === id)
    const item: ToastItem = {
      id, tone, title, description: options.description, action: options.action, duration,
      remaining: duration, runningSince: duration > 0 && !state.paused ? Date.now() : null,
      updateKey: old ? old.updateKey + 1 : 0, ending: false,
    }
    clearTimer(exits, id)
    // Um id repetido mantém o lugar na pilha; um novo entra na frente.
    set({ ...state, toasts: old ? state.toasts.map(entry => entry.id === id ? item : entry) : [...state.toasts, item] })
    arm(item)
    return id
  }
  function dismiss(id?: string) {
    for (const item of state.toasts) if (id === undefined || item.id === id) end(item.id)
  }
  function setPaused(reason: PauseReason, paused: boolean) {
    if (paused === reasons.has(reason)) return
    if (paused) reasons.add(reason)
    else reasons.delete(reason)
    const stopped = reasons.size > 0
    if (stopped === state.paused) return
    const now = Date.now()
    const toasts = state.toasts.map((item): ToastItem => {
      if (item.duration === 0 || item.ending) return item
      if (stopped) return { ...item, remaining: Math.max(0, item.remaining - (now - (item.runningSince ?? now))), runningSince: null }
      return { ...item, runningSince: now }
    })
    for (const item of toasts) {
      if (stopped) clearTimer(expiry, item.id)
      else arm(item)
    }
    set({ toasts, paused: stopped })
  }
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    add,
    dismiss,
    setPaused,
    reset() {
      expiry.forEach(timer => clearTimeout(timer)); expiry.clear()
      exits.forEach(timer => clearTimeout(timer)); exits.clear()
      reasons.clear()
      counter = 0
      state = initial
      listeners.forEach(listener => listener())
    },
  }
}

/** A loja única do app. */
export const toastStore = createToastStore()

/** Chamadas tipadas; cada uma devolve o id do toast. */
export const toast = {
  success: (title: string, options?: ToastOptions) => toastStore.add('success', title, options),
  info: (title: string, options?: ToastOptions) => toastStore.add('info', title, options),
  warning: (title: string, options?: ToastOptions) => toastStore.add('warning', title, options),
  error: (title: string, options?: ToastOptions) => toastStore.add('error', title, options),
  /** Fecha um toast pelo id, ou todos sem argumento. */
  dismiss: (id?: string) => toastStore.dismiss(id),
}

/** Estado atual dos toasts; re-renderiza quando muda. */
export function useToasts(): ToastState {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getState, toastStore.getState)
}
