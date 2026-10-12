import './global.css'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ApiError, clearToken, request } from './src/api/client'
import type { User } from './src/api/client'
import { Button } from './src/components/ui'
import { Screen } from './src/components/Screen'
import { useJoinLink } from './src/navigation/useJoinLink'
import { cx, tw } from './src/styles'
import { colors } from './src/theme'
import ArenaShell from './src/screens/ArenaShell'
import AuthScreen from './src/screens/AuthScreen'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // Link do time (`arena://entrar/{token}` ou `…/entrar/{token}`): o token fica só em memória até a pessoa entrar.
  const { joinToken, consume: joinOpened, restore: restoreJoinToken } = useJoinLink()
  useEffect(() => {
    let alive = true
    request<User>('/me').then(value => { if (alive) setUser(value) }).catch(async err => {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      else if (alive) setError(err.message)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [attempt])
  const expired = useCallback((pendingJoinToken?: string) => {
    // O link do time que ainda estava aberto volta para a memória: o próximo login o reabre.
    if (pendingJoinToken) restoreJoinToken(pendingJoinToken)
    setUser(null); setError('Sua sessão expirou. Entre novamente.'); void clearToken()
  }, [restoreJoinToken])
  return <SafeAreaProvider><Screen className={tw.screen}><StatusBar style="dark" /><KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    {loading ? <ScrollView contentContainerClassName={tw.content}><Text className={cx(tw.brand, 'mb-7.5')}>arena.</Text><ActivityIndicator accessibilityLabel="Carregando Arena" color={colors.brand} /></ScrollView> : user
      ? <ArenaShell user={user} onUser={setUser} onLogout={() => setUser(null)} onExpired={expired} joinToken={joinToken} onJoinOpened={joinOpened} />
      : <ScrollView contentContainerClassName={tw.content} keyboardShouldPersistTaps="handled"><Text className={cx(tw.brand, 'mb-7.5')}>arena.</Text>{error ? <><Text className={tw.error} accessibilityRole="alert">{error}</Text><Button secondary title="Tentar conexão novamente" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}<AuthScreen onLogin={value => { setUser(value); setError('') }} /></ScrollView>}
  </KeyboardAvoidingView></Screen></SafeAreaProvider>
}
