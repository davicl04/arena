import { useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { positions } from '../api/client'
import type { City, Position, Profile, ProfileInput, Sport } from '../api/client'
import { Button, styles } from './ui'

export default function SportCard({ sport, label, profile, cities, onSave }: { sport: Sport; label: string; profile?: Profile; cities: City[]; onSave: (sport: Sport, input: ProfileInput) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [cityId, setCityId] = useState(profile?.city_id || 0)
  const [position, setPosition] = useState<Position | null>(profile?.position || null)
  const [looking, setLooking] = useState(profile?.looking_for || false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function save() {
    if (!cityId) { setError('Selecione uma cidade.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await onSave(sport, { city_id: cityId, position, looking_for: looking }); setEditing(false); setMessage('Perfil salvo.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Tente novamente.') }
    finally { setBusy(false) }
  }
  function edit() { setCityId(profile?.city_id || 0); setPosition(profile?.position || null); setLooking(profile?.looking_for || false); setMessage(''); setError(''); setEditing(true) }
  const city = cities.find(c => c.id === profile?.city_id)
  return <View style={styles.card}><Text style={styles.eyebrow}>{profile ? 'PERFIL ATIVO' : 'COMECE AQUI'}</Text><Text style={styles.heading}>{label}</Text>
    {editing ? <><Text style={styles.label}>Cidade</Text><View style={styles.row}>{cities.map(c => <Pressable key={c.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: cityId === c.id, disabled: busy }} onPress={() => setCityId(c.id)} style={[styles.chip, cityId === c.id && styles.selected]}><Text style={[styles.chipText, cityId === c.id && styles.buttonText]}>{c.name} · {c.state}</Text></Pressable>)}</View>
      {sport === 'futebol' ? <><Text style={styles.label}>Posição preferida</Text><View style={styles.row}>{[{ value: null, label: 'Ainda não definida' }, ...positions].map(p => <Pressable key={p.value || 'none'} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: position === p.value }} onPress={() => setPosition(p.value)} style={[styles.chip, position === p.value && styles.selected]}><Text style={[styles.chipText, position === p.value && styles.buttonText]}>{p.label}</Text></Pressable>)}</View></> : null}
      <View style={[styles.row, { marginTop: 16 }]}><Switch value={looking} onValueChange={setLooking} disabled={busy} accessibilityLabel="Estou procurando oportunidades" trackColor={{ true: '#005a36' }} /><Text style={styles.body}>Procurando oportunidades</Text></View>
      <Button title={busy ? 'Salvando…' : 'Salvar perfil'} disabled={busy} onPress={() => void save()} /><Button secondary title="Cancelar" disabled={busy} onPress={() => setEditing(false)} />
    </> : <><Text style={styles.body}>{city ? `${city.name} · ${city.state}` : 'Cidade a definir'}{'\n'}Sem classificação{profile?.position ? `\n${positions.find(p => p.value === profile.position)?.label}` : ''}{profile ? `\n${profile.looking_for ? 'Procurando oportunidades' : 'Sem procura ativa'}` : ''}</Text><Button secondary title={profile ? 'Editar perfil' : `Adicionar ${label.toLowerCase()}`} onPress={edit} disabled={!cities.length} /></>}
    {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}{message ? <Text style={styles.success} accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>
}
