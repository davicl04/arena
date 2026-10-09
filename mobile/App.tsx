import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ApiError, clearToken, request } from './src/api/client'
import type { User } from './src/api/client'
import { Button, styles } from './src/components/ui'
import AuthScreen from './src/screens/AuthScreen'
import ProfileScreen from './src/screens/ProfileScreen'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    request<User>('/me').then(value => { if (alive) setUser(value) }).catch(async err => {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      else if (alive) setError(err.message)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [attempt])
  function expired() { setUser(null); setError('Sua sessão expirou. Entre novamente.'); void clearToken() }
  return <SafeAreaProvider><SafeAreaView style={styles.screen}><StatusBar style="dark" /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.brand}>arena.</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Carregando Arena" color="#005a36" /> : user ? <ProfileScreen user={user} onUser={setUser} onLogout={() => setUser(null)} onExpired={expired} /> : <>{error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><Button secondary title="Tentar conexão novamente" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}<AuthScreen onLogin={value => { setUser(value); setError('') }} /></>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>
}
