import { useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { positions } from '../api/client'
import { cityLabel } from '../api/cities'
import type { City, Position, Profile, ProfileInput, Sport } from '../api/client'
import { CitySearch } from './arena/CitySearch'
import { toast } from './toast/toastStore'
import { Button } from './ui'
import { reportActionError } from '../hooks/useSubmit'
import { cx, tw } from '../styles'
import { useThemeColors } from '../hooks/useTheme'

export default function SportCard({ sport, label, profile, onSave, onExpired }: { sport: Sport; label: string; profile?: Profile; onSave: (sport: Sport, input: ProfileInput) => Promise<void>; onExpired: () => void }) {
  const colors = useThemeColors()
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState<City | null>(profile?.city ?? null)
  const [position, setPosition] = useState<Position | null>(profile?.position || null)
  const [looking, setLooking] = useState(profile?.looking_for || false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (!city) { setError('Selecione uma cidade.'); return }
    setBusy(true); setError('')
    try { await onSave(sport, { city_id: city.id, position, looking_for: looking }); setEditing(false); toast.success('Perfil salvo.') }
    catch (err) { const report = reportActionError(err, 'Tente novamente.', onExpired); if (report.kind === 'form') setError(report.message) }
    finally { setBusy(false) }
  }
  function edit() { setCity(profile?.city ?? null); setPosition(profile?.position || null); setLooking(profile?.looking_for || false); setError(''); setEditing(true) }
  return <View className={tw.card}><Text className={tw.eyebrow}>{profile ? 'PERFIL ATIVO' : 'COMECE AQUI'}</Text><Text className={tw.heading}>{label}</Text>
    {editing ? <><Text className={tw.label}>Cidade</Text><CitySearch selected={city} onSelect={next => { setCity(next); setError('') }} onExpired={onExpired} />
      {sport === 'futebol' ? <><Text className={tw.label}>Posição preferida</Text><View className={tw.row}>{[{ value: null, label: 'Ainda não definida' }, ...positions].map(p => <Pressable key={p.value || 'none'} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: position === p.value }} onPress={() => setPosition(p.value)} className={cx(tw.chip.base, position === p.value ? tw.chip.selected : tw.chip.idle)}><Text className={position === p.value ? tw.chipText.selected : tw.chipText.idle}>{p.label}</Text></Pressable>)}</View></> : null}
      <View className={cx(tw.row, 'mt-4')}><Switch value={looking} onValueChange={setLooking} disabled={busy} accessibilityLabel="Estou procurando oportunidades" trackColor={{ true: colors.brand }} /><Text className={tw.body}>Procurando oportunidades</Text></View>
      <Button title={busy ? 'Salvando…' : 'Salvar perfil'} disabled={busy} onPress={() => void save()} /><Button secondary title="Cancelar" disabled={busy} onPress={() => setEditing(false)} />
    </> : <><Text className={tw.body}>{profile?.city ? cityLabel(profile.city) : 'Cidade a definir'}{'\n'}Sem classificação{profile?.position ? `\n${positions.find(p => p.value === profile.position)?.label}` : ''}{profile ? `\n${profile.looking_for ? 'Procurando oportunidades' : 'Sem procura ativa'}` : ''}</Text><Button secondary title={profile ? 'Editar perfil' : `Adicionar ${label.toLowerCase()}`} onPress={edit} /></>}
    {error ? <Text className={tw.error} accessibilityRole="alert">{error}</Text> : null}
  </View>
}
