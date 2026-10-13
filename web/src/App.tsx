import { useCallback, useEffect, useState } from 'react'
import { ApiError, request } from './api/client'
import type { User } from './api/client'
import AuthPage from './pages/AuthPage'
import ArenaPage from './pages/ArenaPage'
import { clearJoinPath, joinTokenFrom } from './utils/joinLink'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Dois estados distintos na tela de entrada: a leitura de `/me` falhou (com "Tentar conexão novamente") e a sessão expirou.
  const [bootError, setBootError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Link do time (`/entrar/{token}`): o token fica só em memória até a pessoa entrar (inclusive depois do login ou do
  // cadastro) e o endereço é limpo na hora.
  const [joinToken, setJoinToken] = useState(() => joinTokenFrom(window.location.pathname))
  useEffect(() => { clearJoinPath() }, [])
  const joinOpened = useCallback(() => setJoinToken(null), [])
  useEffect(() => {
    let alive = true
    request<User>('/me')
      .then((value) => {
        if (alive) setUser(value)
      })
      .catch((err) => {
        if (alive && (!(err instanceof ApiError) || err.status !== 401))
          setBootError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [attempt])
  const expired = useCallback((pendingJoinToken?: string) => {
    // O link do time que ainda estava aberto volta para a memória: o próximo login o reabre.
    if (pendingJoinToken) setJoinToken(pendingJoinToken)
    setUser(null)
    setBootError('')
    setSessionExpired(true)
  }, [])
  return (
    <>
      <a
        className="absolute -top-20 left-5 z-skip-link rounded-[8px] bg-white p-3.5 underline focus:top-2.5"
        href="#main"
      >
        Pular para conteúdo
      </a>
      {loading ? (
        <main id="main" className="grid min-h-dvh place-items-center" role="status">
          Carregando seu Arena…
        </main>
      ) : user ? (
        <ArenaPage
          user={user}
          onUser={setUser}
          onLogout={() => setUser(null)}
          onExpired={expired}
          joinToken={joinToken}
          onJoinOpened={joinOpened}
        />
      ) : (
        <AuthPage
          onLogin={(value) => {
            setUser(value)
            setBootError('')
            setSessionExpired(false)
          }}
          expired={sessionExpired}
          notice={bootError}
          onConnectionFailure={setBootError}
          onRetry={() => {
            setBootError('')
            setLoading(true)
            setAttempt((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
