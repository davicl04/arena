import { useCallback, useEffect, useState } from 'react'
import { ApiError, request } from './api/client'
import type { User } from './api/client'
import AuthPage from './pages/AuthPage'
import ArenaPage from './pages/ArenaPage'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    request<User>('/me')
      .then((value) => {
        if (alive) setUser(value)
      })
      .catch((err) => {
        if (alive && (!(err instanceof ApiError) || err.status !== 401))
          setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [attempt])
  const expired = useCallback(() => {
    setUser(null)
    setError('Sua sessão expirou. Entre novamente para continuar.')
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
        />
      ) : (
        <AuthPage
          onLogin={(value) => {
            setUser(value)
            setError('')
          }}
          notice={error}
          onRetry={() => {
            setError('')
            setLoading(true)
            setAttempt((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
