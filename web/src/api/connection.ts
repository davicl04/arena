import { useSyncExternalStore } from 'react'

/*
 * Loja de conexão com a API: diz se a ARENA está alcançável e dirige a folha e a faixa de "Sem conexão"
 * (components/ConnectionNotice.tsx). Quem alimenta é o cliente (`request` em client.ts): falha de rede, timeout, 502, 503
 * e 504 chamam `lost`; qualquer resposta HTTP, mesmo 4xx, chama `reached`. Os eventos `online`/`offline` da janela só
 * dão a dica; a confirmação vem de `GET /health/ready` (fora de `/api/v1`, sem cookie), que também verifica o banco.
 *
 *   online ──lost──▶ offline ──reached / health ok──▶ restored (≈2,5 s) ──▶ online
 *
 * Uma requisição que altera dados e falha por conexão (`lost({ mutating: true })`) é uma ação tentada: abre a folha se
 * ela ainda não foi dispensada; dispensada, só faz a faixa tremer (`nudge`). Leitura só liga a faixa. `background`
 * (contadores, sondagem do chat e da placa) nunca abre a folha. `restored` volta a `online` limpando `sheetDismissed`.
 */
export type ConnectionStatus = 'online' | 'offline' | 'restored'

export interface ConnectionState {
  status: ConnectionStatus
  /** A folha "Sem conexão" está aberta (só com `offline`). */
  sheetOpen: boolean
  /** A pessoa escolheu "Continuar sem conexão": a folha não volta até a conexão voltar. */
  sheetDismissed: boolean
  /** Instante (ms) da próxima consulta automática ao `/health/ready`; `null` fora do `offline`. */
  nextRetryAt: number | null
  /** Uma consulta ao `/health/ready` está em andamento. */
  checking: boolean
  /** Contador que sobe a cada ação tentada com a folha dispensada: a faixa treme quando muda. */
  nudge: number
}

export interface LostOptions {
  /** A requisição altera dados (método diferente de GET): vale como ação tentada. */
  mutating: boolean
  /** Leitura em segundo plano: nunca abre a folha nem faz a faixa tremer. */
  background?: boolean
  /** O erro que a requisição lançou; evita contar a mesma falha duas vezes em `attempted`. */
  cause?: object
}

export interface ConnectionStore {
  getState: () => ConnectionState
  subscribe: (listener: () => void) => () => void
  lost: (options: LostOptions) => void
  reached: () => void
  attempted: (cause?: object) => void
  dismissSheet: () => void
  retryNow: () => void
  /** Avisa quando a conexão volta (entrada em `restored`). Devolve o cancelamento. */
  onRestored: (callback: () => void) => () => void
  /** Liga os eventos `online`/`offline` da janela; devolve o desligamento. */
  listenToWindow: (target?: Window) => () => void
  /** Define o endereço do `/health/ready` (o cliente da API informa o dele). */
  configure: (options: { healthUrl: string }) => void
  /** Volta ao estado inicial e cancela os temporizadores (testes). */
  reset: () => void
}

/** Intervalos da reconexão automática: 5, 10 e 20 s, depois a cada 30 s. */
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 10_000, 20_000]
export const RETRY_STEADY_MS = 30_000
/** Quanto tempo "Conexão restabelecida" fica na tela. */
export const RESTORED_MS = 2_500
const CHECK_TIMEOUT_MS = 8_000

const initial: ConnectionState = { status: 'online', sheetOpen: false, sheetDismissed: false, nextRetryAt: null, checking: false, nudge: 0 }

export function createConnectionStore(options: { healthUrl?: string } = {}): ConnectionStore {
  let state: ConnectionState = initial
  let healthUrl = options.healthUrl ?? ''
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let restoredTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const restoredListeners = new Set<() => void>()
  const handled = new WeakSet<object>()

  function set(patch: Partial<ConnectionState>) {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  function clearTimers() {
    clearTimeout(retryTimer); retryTimer = undefined
    clearTimeout(restoredTimer); restoredTimer = undefined
  }
  function schedule() {
    clearTimeout(retryTimer)
    const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_STEADY_MS
    set({ nextRetryAt: Date.now() + delay, checking: false })
    retryTimer = setTimeout(() => { void check() }, delay)
  }
  async function check() {
    clearTimeout(retryTimer)
    if (state.status !== 'offline' || state.checking) return
    set({ checking: true })
    let ok = false
    try {
      const response = await fetch(healthUrl, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      ok = response.ok
    } catch { /* continua sem conexão */ }
    if (state.status !== 'offline') return
    if (ok) { reached(); return }
    attempt += 1
    schedule()
  }
  function lost({ mutating, background = false, cause }: LostOptions) {
    if (state.status !== 'offline') {
      clearTimeout(restoredTimer); restoredTimer = undefined
      attempt = 0
      set({ status: 'offline' })
      schedule()
    }
    if (mutating && !background) attempted(cause)
  }
  function attempted(cause?: object) {
    if (cause) {
      if (handled.has(cause)) return
      handled.add(cause)
    }
    if (state.status !== 'offline') lost({ mutating: false })
    if (state.sheetDismissed) set({ nudge: state.nudge + 1 })
    else if (!state.sheetOpen) set({ sheetOpen: true })
  }
  function reached() {
    if (state.status !== 'offline') return
    clearTimeout(retryTimer); retryTimer = undefined
    attempt = 0
    set({ status: 'restored', sheetOpen: false, nextRetryAt: null, checking: false })
    restoredTimer = setTimeout(() => {
      restoredTimer = undefined
      set({ status: 'online', sheetDismissed: false })
    }, RESTORED_MS)
    restoredListeners.forEach(callback => callback())
  }
  function retryNow() {
    if (state.status === 'offline') void check()
  }
  /** Dica da janela de que a rede caiu: confirma no `/health/ready` antes de acusar a falta de conexão. */
  async function probe() {
    if (state.status === 'offline') { retryNow(); return }
    let ok = false
    try {
      const response = await fetch(healthUrl, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      ok = response.ok
    } catch { /* sem resposta */ }
    if (!ok) lost({ mutating: false })
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    lost,
    reached,
    attempted,
    dismissSheet() { if (state.sheetOpen) set({ sheetOpen: false, sheetDismissed: true }) },
    retryNow,
    onRestored(callback) { restoredListeners.add(callback); return () => { restoredListeners.delete(callback) } },
    listenToWindow(target = window) {
      const goOnline = () => retryNow()
      const goOffline = () => { void probe() }
      target.addEventListener('online', goOnline)
      target.addEventListener('offline', goOffline)
      return () => { target.removeEventListener('online', goOnline); target.removeEventListener('offline', goOffline) }
    },
    configure(next) { healthUrl = next.healthUrl },
    reset() {
      clearTimers()
      attempt = 0
      state = initial
      listeners.forEach(listener => listener())
    },
  }
}

/** A loja única do app. */
export const connection = createConnectionStore()

/** Estado atual da conexão; re-renderiza quando muda. */
export function useConnection(): ConnectionState {
  return useSyncExternalStore(connection.subscribe, connection.getState, connection.getState)
}
