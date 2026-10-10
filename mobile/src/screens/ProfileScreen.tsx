import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ApiError, apiUrl, clearToken, getToken, request, sports } from '../api/client'
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
  const [avatarToken, setAvatarToken] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all([request<Profile[]>('/me/sports-profiles'), request<City[]>('/cities')]).then(([p, c]) => { if (alive) { setProfiles(p); setCities(c) } })
      .catch(err => { if (alive) { setError(err.message); if (err instanceof ApiError && err.status === 401) onExpired() } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])
  useEffect(() => { let alive = true; void getToken().then(token => { if (alive) setAvatarToken(token) }); return () => { alive = false } }, [user.avatar?.id])
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
  async function pickAvatar() {
    setError(''); setMessage('')
    let result: ImagePicker.ImagePickerResult
    try { result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: true, aspect: [1, 1], quality: 0.85 }) }
    catch (err) { fail(err); return }
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setError('A imagem deve ter até 5 MiB.'); return }
    const form = new FormData()
    form.append('file', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob)
    setBusy(true)
    try { onUser(await request<User>('/me/avatar', 'PUT', form)); setAvatarFailed(false); setMessage('Foto de perfil atualizada.') }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  async function removeAvatar() {
    setBusy(true); setError(''); setMessage('')
    try { await request<void>('/me/avatar', 'DELETE'); onUser({ ...user, avatar: null }); setAvatarFailed(false); setMessage('Foto de perfil removida.') }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  return <><Text style={styles.eyebrow}>MEU ARENA</Text><Text style={styles.title}>Seu jogo. Sua trajetória.</Text><View style={styles.card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      {user.avatar && avatarToken && !avatarFailed ? <Image key={user.avatar.id} accessibilityLabel={`Foto de ${user.name}`} source={{ uri: apiUrl(user.avatar.url), headers: { Authorization: `Bearer ${avatarToken}` } }} onError={() => setAvatarFailed(true)} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#e2e4e9' }} /> : <View accessibilityRole="image" accessibilityLabel={`Iniciais de ${user.name}`} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#e2e4e9', alignItems: 'center', justifyContent: 'center' }}><Text style={styles.heading}>{initials}</Text></View>}
      <View style={{ flex: 1 }}><Text style={styles.heading}>{user.name}</Text><Text style={styles.body}>{user.email}{'\n'}Perfil privado</Text></View>
    </View>
    <Button secondary title={user.avatar ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'} disabled={busy} onPress={() => void pickAvatar()} />
    {user.avatar ? <Button secondary title="Remover foto" disabled={busy} onPress={() => void removeAvatar()} /> : null}
    {editing ? <><Field label="Nome completo" value={name} onChangeText={setName} editable={!busy} maxLength={100} /><Button title="Salvar nome" disabled={busy} onPress={() => void rename()} /></> : null}
    <Button secondary title={editing ? 'Cancelar edição' : 'Editar nome'} disabled={busy} onPress={() => { setName(user.name); setEditing(v => !v) }} />
  </View>{error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><Button secondary title="Recarregar dados" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}{message ? <Text style={styles.success} accessibilityLiveRegion="polite">{message}</Text> : null}
    <Text style={styles.heading}>Suas modalidades</Text>{loading ? <ActivityIndicator accessibilityLabel="Carregando modalidades" /> : sports.map(s => <SportCard key={s.value} sport={s.value} label={s.label} cities={cities} profile={profiles.find(p => p.sport === s.value)} onSave={save} />)}
    {!loading && !profiles.length && !error ? <Text style={styles.body}>Adicione sua primeira modalidade acima.</Text> : null}<Button secondary title={busy ? 'Aguarde…' : 'Sair da conta'} disabled={busy} onPress={() => void logout()} />
  </>
}
