import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { CHAT_POLL_MS, getMessages, sendMessage } from '../api/matches'
import type { MatchMessageOut } from '../api/matches'

/** Junta mensagens novas às atuais sem repetir ids, em ordem crescente. */
export function mergeMessages(old: MatchMessageOut[], incoming: MatchMessageOut[]): MatchMessageOut[] {
  if (!incoming.length) return old
  const byId = new Map(old.map(message => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  // Reapply removals when an older page arrives after the moderation event.
  for (const message of byId.values()) {
    if (message.event_type !== 'mensagem_removida') continue
    const id = message.payload?.message_id
    const target = typeof id === 'number' ? byId.get(id) : undefined
    if (target?.kind === 'texto') byId.set(target.id, { ...target, body: null, removed: true })
  }
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

const messageOf = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback

/**
 * Chat da partida (contrato 0002, 11.1): lê as últimas mensagens ao abrir e depois só as novas, com `after={último id}`,
 * a cada 4 s com escrita aberta ou 30 s em somente leitura (pausa com a aba oculta; ao voltar, lê na hora). Carrega as anteriores com
 * `before`. O envio acrescenta a mensagem devolvida sem mexer no cursor da leitura, para não pular mensagens do outro
 * lado que chegaram antes.
 */
export function useMatchChat(matchId: number, enabled: boolean, onExpired: () => void, onEvent?: () => void, live = true) {
  const [items, setItems] = useState<MatchMessageOut[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const alive = useRef(true)
  const onExpiredRef = useRef(onExpired)
  const onEventRef = useRef(onEvent)
  const liveRef = useRef(live)
  useEffect(() => { onExpiredRef.current = onExpired; onEventRef.current = onEvent; liveRef.current = live }, [onExpired, onEvent, live])

  useEffect(() => {
    if (!enabled) return
    alive.current = true
    let timer: number | undefined
    let busy = false
    let stopped = false
    let loaded = false
    let lastId: number | null = null

    async function poll() {
      if (busy || stopped) return
      busy = true
      try {
        let more = true
        while (more && !stopped) {
          const page = await getMessages(matchId, loaded ? { after: lastId ?? 0 } : {}, { background: true })
          if (stopped) return
          if (page.last_id !== null) lastId = Math.max(lastId ?? 0, page.last_id)
          if (loaded) {
            setItems(old => mergeMessages(old, page.items))
            more = page.has_more
            // Evento novo (aceite, cancelamento, vagas…): a partida mudou e o cartão de condições precisa reler.
            if (page.items.some(item => item.kind === 'evento')) onEventRef.current?.()
          } else {
            setItems(mergeMessages([], page.items))
            setHasOlder(page.has_more)
            loaded = true
            more = false
          }
          setOffline(false)
          setError('')
          setReady(true)
        }
      } catch (cause) {
        if (stopped) return
        if (cause instanceof ApiError && cause.status === 401) onExpiredRef.current()
        if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
          // Chat fechado para quem lê (403/404): não adianta insistir.
          stopped = true
          setError(messageOf(cause, 'Não foi possível carregar o chat.'))
          setReady(true)
          return
        }
        // Falha de rede: avisa e tenta de novo no próximo ciclo.
        setOffline(true)
        setReady(true)
        if (!loaded) setError(messageOf(cause, 'Não foi possível carregar o chat.'))
      } finally {
        busy = false
        schedule()
      }
    }
    function schedule() {
      window.clearTimeout(timer)
      // Chats encerrados ainda recebem moderação, com leitura menos frequente.
      if (stopped || document.hidden) return
      timer = window.setTimeout(() => void poll(), liveRef.current ? CHAT_POLL_MS : 30_000)
    }
    function onVisibility() {
      window.clearTimeout(timer)
      if (!document.hidden && !busy) void poll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    void poll()
    return () => {
      stopped = true
      alive.current = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [matchId, enabled])

  const loadOlder = useCallback(async () => {
    const first = items[0]
    if (!first || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await getMessages(matchId, { before: first.id })
      if (!alive.current) return
      setItems(old => mergeMessages(old, page.items))
      setHasOlder(page.has_more)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpiredRef.current()
      if (alive.current) setError(messageOf(cause, 'Não foi possível carregar as mensagens anteriores.'))
    } finally {
      if (alive.current) setLoadingOlder(false)
    }
  }, [items, loadingOlder, matchId])

  const send = useCallback(async (body: string): Promise<boolean> => {
    setSending(true)
    setSendError('')
    try {
      const message = await sendMessage(matchId, body)
      if (alive.current) setItems(old => mergeMessages(old, [message]))
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpiredRef.current()
      if (alive.current) setSendError(messageOf(cause, 'Não foi possível enviar a mensagem.'))
      return false
    } finally {
      if (alive.current) setSending(false)
    }
  }, [matchId])

  return { items, loading: enabled && !ready, error, offline, hasOlder, loadingOlder, loadOlder, sending, sendError, send }
}
