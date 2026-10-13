import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { getStats } from '@/api/results'
import type { Lineup } from '@/api/results'

interface State { items: Lineup[]; error: string }

/**
 * Elenco dos dois lados com presença, estatísticas e prévia (`GET /matches/{id}/stats`). Lê de novo quando o estado do
 * resultado muda (`signature`: confirmação, divergência, prazo) e mantém a lista anterior até a nova chegar. As ações
 * do cartão trocam a lista ou um atleta na hora, com a resposta da API. 401 chama `onExpired`.
 */
export function useLineups(matchId: number, signature: string, enabled: boolean, onExpired: () => void) {
  const [state, setState] = useState<State>({ items: [], error: '' })
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const current = ++generation.current
    getStats(matchId).then(({ items }) => {
      if (generation.current === current) setState({ items, error: '' })
    }).catch((cause: unknown) => {
      if (generation.current !== current) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setState(old => ({ ...old, error: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o elenco.' }))
    })
    return () => { generation.current = current + 1 }
  }, [matchId, signature, enabled, attempt, onExpired])

  const replaceAll = useCallback((items: Lineup[]) => setState({ items, error: '' }), [])
  const replaceOne = useCallback((updated: Lineup) => setState(old => ({
    ...old, items: old.items.map(item => (item.user.id === updated.user.id ? updated : item)),
  })), [])
  const reload = useCallback(() => setAttempt(count => count + 1), [])
  return { items: state.items, error: state.error, replaceAll, replaceOne, reload }
}
