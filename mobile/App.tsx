import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ApiError, clearToken, request } from './src/api/client'
import type { User } from './src/api/client'
import { Button, styles } from './src/components/ui'
import AuthScreen from './src/screens/AuthScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import CommunityScreen from './src/screens/CommunityScreen'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<'community' | 'profile'>('community')
  useEffect(() => {
    let alive = true
    request<User>('/me').then(value => { if (alive) setUser(value) }).catch(async err => {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      else if (alive) setError(err.message)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [attempt])
  const expired = useCallback(() => { setUser(null); setError('Sua sessão expirou. Entre novamente.'); void clearToken() }, [])
  return <SafeAreaProvider><SafeAreaView style={styles.screen}><StatusBar style="dark" /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    {loading ? <ScrollView contentContainerStyle={styles.content}><Text style={styles.brand}>arena.</Text><ActivityIndicator accessibilityLabel="Carregando Arena" color="#005a36" /></ScrollView> : user ? <>
      <View style={{ paddingHorizontal: 22, paddingTop: 14 }}><Text style={[styles.brand, { marginBottom: 8 }]}>arena.</Text></View>
      <View style={{ flex: 1 }}>{tab === 'community' ? <CommunityScreen key="community" user={user} onExpired={expired} /> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><ProfileScreen user={user} onUser={setUser} onLogout={() => setUser(null)} onExpired={expired} /></ScrollView>}</View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 8, borderTopWidth: 1, borderColor: '#cdd4d0', backgroundColor: '#ffffff' }}>
        {(['community', 'profile'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: tab === value ? '#005a36' : '#606965', fontWeight: tab === value ? '700' : '500' }}>{value === 'community' ? 'Comunidade' : 'Perfil'}</Text></Pressable>)}
      </View>
    </> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.brand}>arena.</Text>{error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><Button secondary title="Tentar conexão novamente" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}<AuthScreen onLogin={value => { setUser(value); setError(''); setTab('community') }} /></ScrollView>}
  </KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>
}
