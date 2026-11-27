import { useCallback, useEffect, useState } from 'react'
import type { User } from '../api/client'
import { Gate } from '../components/landing/Gate'
import { useGate } from '../hooks/useGate'
import { prefersReducedMotion } from '../lib/motion'
import AuthPage from './AuthPage'
import type { AuthMode } from './AuthPage'
import LandingPage from './LandingPage'

/** Chave própria no estado do histórico: a entrada aberta pela landing, com o modo escolhido. O endereço continua `/`. */
const ENTRY_STATE_KEY = 'arenaEntrada'

type View = { screen: 'landing' } | { screen: 'entrada'; mode: AuthMode; fromLanding: boolean }

/** Modo da entrada registrado no estado do histórico, ou `null` (a landing). */
function entryModeFrom(state: unknown): AuthMode | null {
  const mode = state && typeof state === 'object' ? (state as Record<string, unknown>)[ENTRY_STATE_KEY] : null
  return mode === 'login' || mode === 'register' ? mode : null
}

/*
 * Tela pública da web (sem sessão): decide entre a landing e a tela de entrada.
 * - A entrada aberta pela landing fica no histórico (`pushState` com estado próprio, sem mudar o endereço). Ao montar
 *   de novo sobre essa entrada (nova tentativa de conexão, recarga), ela continua aberta, com "← Voltar para o início".
 * - Atalhos diretos, sem landing e sem empurrar histórico: sessão expirada (`expired`), falha da leitura inicial da conta
 *   (`notice`) e convite de time pendente (`joinPending`).
 * - Sem contexto, a landing.
 * O Voltar do navegador (`popstate`) e "← Voltar para o início" (`history.back()`) retornam à landing, sem portão. Ao
 * entrar, a marca da entrada sai do estado do histórico, para que a próxima tela pública (sair, sessão expirada) não a
 * herde.
 * Da landing para a entrada passa o portão (`Gate`): a troca acontece com ele fechado, a página fica inerte durante a
 * sequência e o foco vai ao primeiro campo só quando ele termina. Com "reduzir movimento", a troca é direta.
 */
export default function PublicScreen({
  expired,
  notice,
  joinPending,
  onLogin,
  onRetry,
  onConnectionFailure,
}: {
  expired: boolean
  notice: string
  joinPending: boolean
  onLogin: (user: User) => void
  onRetry: () => void
  onConnectionFailure: (message: string) => void
}) {
  const [view, setView] = useState<View>(() => {
    const mode = entryModeFrom(window.history.state)
    if (mode) return { screen: 'entrada', mode, fromLanding: true }
    return expired || notice || joinPending ? { screen: 'entrada', mode: 'login', fromLanding: false } : { screen: 'landing' }
  })

  const { phase: gatePhase, run: runGate, cancel: cancelGate, busy: gateBusy } = useGate()

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // O histórico mudou no meio do portão: a sequência para e a tela segue o histórico, sem portão.
      cancelGate()
      const mode = entryModeFrom(event.state)
      setView(mode ? { screen: 'entrada', mode, fromLanding: true } : { screen: 'landing' })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [cancelGate])

  /** Único caminho da landing para a tela de entrada (hero e fecho, Entrar ou Criar conta). */
  const enter = useCallback(
    (mode: AuthMode) => {
      const open = () => {
        window.history.pushState({ [ENTRY_STATE_KEY]: mode }, '')
        document.scrollingElement?.scrollTo?.({ top: 0 })
        setView({ screen: 'entrada', mode, fromLanding: true })
      }
      if (gateBusy()) return
      if (prefersReducedMotion()) open()
      else runGate(open)
    },
    [gateBusy, runGate],
  )

  const login = useCallback(
    (user: User) => {
      if (entryModeFrom(window.history.state)) window.history.replaceState(null, '')
      onLogin(user)
    },
    [onLogin],
  )

  return (
    <>
      {/* Durante o portão, a página por baixo não recebe ponteiro, teclado nem foco. */}
      <div className="contents" inert={gatePhase !== null}>
        {view.screen === 'landing' ? (
          <LandingPage onEnter={enter} />
        ) : (
          <AuthPage
            initialMode={view.mode}
            focusFirstField={view.fromLanding && gatePhase === null}
            onBack={view.fromLanding ? () => window.history.back() : undefined}
            onLogin={login}
            expired={expired}
            notice={notice}
            onRetry={onRetry}
            onConnectionFailure={onConnectionFailure}
          />
        )}
      </div>
      {gatePhase && <Gate phase={gatePhase} />}
    </>
  )
}
