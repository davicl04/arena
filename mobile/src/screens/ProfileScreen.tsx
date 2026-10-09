import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { ApiError, clearToken, request, sports } from '../api/client'
import type { City, Profile, ProfileInput, Sport, User } from '../api/client'
import { Button, Field, styles } from '../components/ui'
import SportCard from '../components/SportCard'

export default function ProfileScreen({ user, onUser, onLogout, onExpired }: { user: User; onUser: (user: User) => void; onLogout: () => void; onExpired: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(user.name)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    Promise.all([request<Profile[]>('/me/sports-profiles'), request<City[]>('/cities')]).then(([p, c]) => { if (alive) { setProfiles(p); setCities(c) } })
      .catch(err => { if (alive) { setError(err.message); if (err instanceof ApiError && err.status === 401) onExpired() } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])
  function fail(err: unknown) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Tente novamente.') }
  async function save(sport: Sport, input: ProfileInput) {
    try { const p = await request<Profile>(`/me/sports-profiles/${sport}`, 'PUT', input); setProfiles(old => [...old.filter(v => v.sport !== sport), p]) }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); throw err }
  }
  async function logout() {
    setBusy(true); setError('')
    try { await request('/auth/logout', 'POST'); await clearToken(); onLogout() }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  async function rename() {
    setBusy(true); setError(''); setMessage('')
    try { onUser(await request<User>('/me', 'PATCH', { name })); setEditing(false); setMessage('Nome atualizado.') }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  return <><Text style={styles.eyebrow}>MEU ARENA</Text><Text style={styles.title}>Seu jogo. Sua trajetória.</Text><View style={styles.card}><Text style={styles.heading}>{user.name}</Text><Text style={styles.body}>{user.email}{'\n'}Perfil privado</Text>
    {editing ? <><Field label="Nome completo" value={name} onChangeText={setName} editable={!busy} maxLength={100} /><Button title="Salvar nome" disabled={busy} onPress={() => void rename()} /></> : null}
    <Button secondary title={editing ? 'Cancelar edição' : 'Editar nome'} disabled={busy} onPress={() => { setName(user.name); setEditing(v => !v) }} />
  </View>{error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><Button secondary title="Recarregar dados" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}{message ? <Text style={styles.success} accessibilityLiveRegion="polite">{message}</Text> : null}
    <Text style={styles.heading}>Suas modalidades</Text>{loading ? <ActivityIndicator accessibilityLabel="Carregando modalidades" /> : sports.map(s => <SportCard key={s.value} sport={s.value} label={s.label} cities={cities} profile={profiles.find(p => p.sport === s.value)} onSave={save} />)}
    {!loading && !profiles.length && !error ? <Text style={styles.body}>Adicione sua primeira modalidade acima.</Text> : null}<Button secondary title={busy ? 'Aguarde…' : 'Sair da conta'} disabled={busy} onPress={() => void logout()} />
  </>
}
