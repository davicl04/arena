import { useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { positions } from '../api/client'
import type { City, Position, Profile, ProfileInput, Sport } from '../api/client'
import { Button } from './ui'
import { cx, tw } from '../styles'
import { colors } from '../theme'

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
  return <View className={tw.card}><Text className={tw.eyebrow}>{profile ? 'PERFIL ATIVO' : 'COMECE AQUI'}</Text><Text className={tw.heading}>{label}</Text>
    {editing ? <><Text className={tw.label}>Cidade</Text><View className={tw.row}>{cities.map(c => <Pressable key={c.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: cityId === c.id, disabled: busy }} onPress={() => setCityId(c.id)} className={cx(tw.chip.base, cityId === c.id ? tw.chip.selected : tw.chip.idle)}><Text className={cityId === c.id ? tw.chipText.selected : tw.chipText.idle}>{c.name} · {c.state}</Text></Pressable>)}</View>
      {sport === 'futebol' ? <><Text className={tw.label}>Posição preferida</Text><View className={tw.row}>{[{ value: null, label: 'Ainda não definida' }, ...positions].map(p => <Pressable key={p.value || 'none'} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: position === p.value }} onPress={() => setPosition(p.value)} className={cx(tw.chip.base, position === p.value ? tw.chip.selected : tw.chip.idle)}><Text className={position === p.value ? tw.chipText.selected : tw.chipText.idle}>{p.label}</Text></Pressable>)}</View></> : null}
      <View className={cx(tw.row, 'mt-4')}><Switch value={looking} onValueChange={setLooking} disabled={busy} accessibilityLabel="Estou procurando oportunidades" trackColor={{ true: colors.brand }} /><Text className={tw.body}>Procurando oportunidades</Text></View>
      <Button title={busy ? 'Salvando…' : 'Salvar perfil'} disabled={busy} onPress={() => void save()} /><Button secondary title="Cancelar" disabled={busy} onPress={() => setEditing(false)} />
    </> : <><Text className={tw.body}>{city ? `${city.name} · ${city.state}` : 'Cidade a definir'}{'\n'}Sem classificação{profile?.position ? `\n${positions.find(p => p.value === profile.position)?.label}` : ''}{profile ? `\n${profile.looking_for ? 'Procurando oportunidades' : 'Sem procura ativa'}` : ''}</Text><Button secondary title={profile ? 'Editar perfil' : `Adicionar ${label.toLowerCase()}`} onPress={edit} disabled={!cities.length} /></>}
    {error ? <Text className={tw.error} accessibilityRole="alert">{error}</Text> : null}{message ? <Text className={tw.success} accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>
}
