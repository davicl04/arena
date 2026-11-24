import './global.css'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ApiError, clearToken, request } from './src/api/client'
import type { User } from './src/api/client'
import { ErrorBoundary } from './src/components/ErrorBoundary'
import { ToastViewport } from './src/components/toast/ToastViewport'
import { toastStore } from './src/components/toast/toastStore'
import { LoadError } from './src/components/arena/LoadError'
import { Screen } from './src/components/Screen'
import { useJoinLink } from './src/navigation/useJoinLink'
import { cx, tw } from './src/styles'
import { themeStore, useResolvedTheme, useThemeColors } from './src/hooks/useTheme'
import { colors as fixedColors } from './src/theme'
import ArenaShell from './src/screens/ArenaShell'
import AuthScreen from './src/screens/AuthScreen'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Dois estados separados da tela de entrada: a sessão que expirou (texto) e a falha ao conferir a sessão (`/me`, com nova tentativa).
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loadFailure, setLoadFailure] = useState<{ message: string; cause: unknown } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Link do time (`arena://entrar/{token}` ou `…/entrar/{token}`): o token fica só em memória até a pessoa entrar.
  const { joinToken, consume: joinOpened, restore: restoreJoinToken } = useJoinLink()
  // Tema (docs/plano-tema.md): a preferência do aparelho é lida uma vez; até lá, vale o sistema.
  useEffect(() => { void themeStore.load() }, [])
  const theme = useResolvedTheme()
  const colors = useThemeColors()
  useEffect(() => {
    let alive = true
    request<User>('/me').then(value => { if (alive) setUser(value) }).catch(async err => {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      else if (alive) setLoadFailure({ message: err.message, cause: err })
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [attempt])
  const expired = useCallback((pendingJoinToken?: string) => {
    // O link do time que ainda estava aberto volta para a memória: o próximo login o reabre.
    if (pendingJoinToken) restoreJoinToken(pendingJoinToken)
    toastStore.reset()
    setUser(null); setSessionExpired(true); void clearToken()
  }, [restoreJoinToken])
  const logout = useCallback(() => { toastStore.reset(); setUser(null) }, [])
  // Tela de entrada (Dividida estreita): escura por design nos dois temas. A faixa da marca sobe por baixo da barra de status, que fica clara.
  const entrance = !loading && !user
  const retry = () => { setLoadFailure(null); setLoading(true); setAttempt(v => v + 1) }
  return <SafeAreaProvider><Screen className={entrance ? 'grow basis-0 bg-night' : tw.screen} edges={entrance ? ['right', 'bottom', 'left'] : undefined}><StatusBar style={entrance || theme === 'dark' ? 'light' : 'dark'} /><KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ErrorBoundary>
    {loading ? <ScrollView contentContainerClassName={tw.content}><Text className={cx(tw.brand, 'mb-7.5')}>arena.</Text><ActivityIndicator accessibilityLabel="Carregando Arena" color={colors.brand} /></ScrollView> : user
      ? <ArenaShell user={user} onUser={setUser} onLogout={logout} onExpired={expired} joinToken={joinToken} onJoinOpened={joinOpened} />
      : <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <AuthScreen notice={<>
          {sessionExpired ? <Text accessibilityRole="alert" style={{ marginTop: 14, overflow: 'hidden', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(244,197,106,0.1)', color: fixedColors['warning-soft'], fontSize: 13, lineHeight: 19 }}>Sua sessão expirou. Entre novamente.</Text> : null}
          {loadFailure ? <LoadError size="section" tone="dark" title="Não foi possível conectar" text={loadFailure.message} cause={loadFailure.cause} onRetry={retry} /> : null}
        </>} onLogin={value => { setUser(value); setSessionExpired(false); setLoadFailure(null) }} onConnectionFailure={cause => setLoadFailure({ message: cause.message, cause })} />
      </ScrollView>}
    {/* Sem a área logada (carregando ou tela de entrada): confirmações de cadastro e recuperação, a 16 pt da base. */}
    {!user ? <ToastViewport placement="screen" /> : null}
  </ErrorBoundary></KeyboardAvoidingView></Screen></SafeAreaProvider>
}
