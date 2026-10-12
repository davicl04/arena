import { useEffect, useState } from 'react'
import { getToken } from '../api/client'

/**
 * Token Bearer da sessão (SecureStore) para as mídias privadas da API, que o `Image` carrega com o header
 * `Authorization`. Com `provided` (a tela já leu o token), devolve esse valor e não lê de novo.
 */
export function useSessionToken(provided?: string | null): string | null {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    if (provided !== undefined) return
    let alive = true
    void getToken().then(value => { if (alive) setToken(value) })
    return () => { alive = false }
  }, [provided])
  return provided !== undefined ? provided : token
}
