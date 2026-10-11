import './global.css'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ApiError, clearToken, request } from './src/api/client'
import type { User } from './src/api/client'
import { Button } from './src/components/ui'
import { Screen } from './src/components/Screen'
import { cx, tw } from './src/styles'
import { colors } from './src/theme'
import AuthScreen from './src/screens/AuthScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import CommunityScreen from './src/screens/CommunityScreen'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<'community' | 'profile'>('community')
  // Pedido do quadro "Nova foto" do perfil: a Comunidade abre já no fluxo de nova publicação.
  const [compose, setCompose] = useState(false)
  const composeStarted = useCallback(() => setCompose(false), [])
  useEffect(() => {
    let alive = true
    request<User>('/me').then(value => { if (alive) setUser(value) }).catch(async err => {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      else if (alive) setError(err.message)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [attempt])
  const expired = useCallback(() => { setUser(null); setError('Sua sessão expirou. Entre novamente.'); void clearToken() }, [])
  return <SafeAreaProvider><Screen className={tw.screen}><StatusBar style="dark" /><KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    {loading ? <ScrollView contentContainerClassName={tw.content}><Text className={cx(tw.brand, 'mb-7.5')}>arena.</Text><ActivityIndicator accessibilityLabel="Carregando Arena" color={colors.brand} /></ScrollView> : user ? <>
      <View className="px-5.5 pt-3.5"><Text className={cx(tw.brand, 'mb-2')}>arena.</Text></View>
      <View className="grow basis-0">{tab === 'community' ? <CommunityScreen key="community" user={user} onExpired={expired} composeOnOpen={compose} onComposeStarted={composeStarted} /> : <ProfileScreen user={user} onUser={setUser} onLogout={() => setUser(null)} onExpired={expired} onNewPhoto={() => { setCompose(true); setTab('community') }} />}</View>
      <View accessibilityRole="tablist" className="flex-row border-t border-line bg-white p-2">
        {(['community', 'profile'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} className="min-h-[46px] grow basis-0 items-center justify-center"><Text className={tab === value ? 'font-bold text-brand' : 'font-medium text-ink-muted'}>{value === 'community' ? 'Comunidade' : 'Perfil'}</Text></Pressable>)}
      </View>
    </> : <ScrollView contentContainerClassName={tw.content} keyboardShouldPersistTaps="handled"><Text className={cx(tw.brand, 'mb-7.5')}>arena.</Text>{error ? <><Text className={tw.error} accessibilityRole="alert">{error}</Text><Button secondary title="Tentar conexão novamente" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}<AuthScreen onLogin={value => { setUser(value); setError(''); setTab('community') }} /></ScrollView>}
  </KeyboardAvoidingView></Screen></SafeAreaProvider>
}
