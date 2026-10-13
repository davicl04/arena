import { useSyncExternalStore } from 'react'

/*
 * Loja de conexão com a API (porta de `api/connection.ts` da web): diz se a ARENA está alcançável e dirige a folha e a
 * faixa de "Sem conexão" (components/ConnectionNotice.tsx). Quem alimenta é o cliente (`request` em client.ts): falha de
 * rede, timeout, 502, 503 e 504 chamam `lost`; qualquer resposta HTTP, mesmo 4xx, chama `reached`. O Expo não tem NetInfo:
 * a confirmação vem de `GET /health/ready` (fora de `/api/v1`, sem Bearer), que também verifica o banco. Ao voltar ao primeiro
 * plano com o aviso ligado, o `ConnectionNotice` chama `retryNow`. Este módulo não importa `react-native`: os clientes da API
 * rodam nos testes de Node sem o ambiente nativo.
 *
 *   online ──lost──▶ offline ──reached / health ok──▶ restored (≈2,5 s) ──▶ online
 *
 * Uma requisição que altera dados e falha por conexão (`lost({ mutating: true })`) é uma ação tentada: abre a folha se
 * ela ainda não foi dispensada; dispensada, só faz a faixa tremer (`nudge`). Leitura só liga a faixa. `background`
 * (sondagem do chat e da placa) nunca abre a folha. `restored` volta a `online` limpando `sheetDismissed`.
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
/** Tempo máximo de uma consulta ao `/health/ready`. */
export const CHECK_TIMEOUT_MS = 8_000

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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
    let ok = false
    try {
      ok = (await fetch(healthUrl, { cache: 'no-store', signal: controller.signal })).ok
    } catch { /* continua sem conexão */ } finally { clearTimeout(timer) }
    if (state.status !== 'offline') return
    if (ok) { reached(); return }
    attempt += 1
    schedule()
  }
  function lost({ mutating, background = false, cause }: LostOptions) {
    if (state.status !== 'offline') {
      clearTimeout(restoredTimer)
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
    clearTimeout(retryTimer)
    attempt = 0
    set({ status: 'restored', sheetOpen: false, nextRetryAt: null, checking: false })
    restoredTimer = setTimeout(() => set({ status: 'online', sheetDismissed: false }), RESTORED_MS)
    restoredListeners.forEach(callback => callback())
  }
  function retryNow() {
    if (state.status === 'offline') void check()
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
    configure(next) { healthUrl = next.healthUrl },
    reset() {
      clearTimeout(retryTimer)
      clearTimeout(restoredTimer)
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
