import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ApiError, request } from '../api/client'
import type { User, UsernameAvailability } from '../api/client'
import { availabilityMessage, normalizeUsername, usernameProblem } from '../utils/profile'
import { Button, Field } from './ui'
import { cx, tw } from '../styles'

// O resultado fica ligado ao @ consultado (for): se o texto mudou, a verificação está pendente.
type Check = { for: string; failed: boolean; text: string; result?: UsernameAvailability }

// Edita o @: regras ao vivo, verificação de disponibilidade com debounce, sugestões e tratamento do 409.
export default function UsernameForm({ current, onSaved, onExpired }: { current: string; onSaved: (user: User) => void; onExpired: () => void }) {
  const [value, setValue] = useState(current)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const normalized = normalizeUsername(value)
  const problem = usernameProblem(normalized)
  const unchanged = normalized === current
  useEffect(() => {
    if (problem || unchanged) return
    let alive = true
    const timer = setTimeout(() => {
      request<UsernameAvailability>(`/me/username-availability?u=${encodeURIComponent(normalized)}`)
        .then(result => { if (alive) setCheck({ for: normalized, failed: false, text: availabilityMessage(result), result }) })
        .catch(err => { if (alive) { if (err instanceof ApiError && err.status === 401) onExpired(); setCheck({ for: normalized, failed: true, text: 'Não foi possível verificar agora. Você ainda pode tentar salvar.' }) } })
    }, 450)
    return () => { alive = false; clearTimeout(timer) }
  }, [normalized, problem, unchanged, onExpired])
  const entry = check?.for === normalized ? check : null
  const checking = !problem && !unchanged && !entry
  const unavailable = entry?.result ? !entry.result.available : false
  async function save() {
    setBusy(true); setError('')
    try { onSaved(await request<User>('/me', 'PATCH', { username: normalized })) }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired()
      if (err instanceof ApiError && err.status === 409) setCheck({ for: normalized, failed: false, text: err.message, result: { available: false, reason: 'taken', suggestions: [] } })
      else setError(err instanceof Error ? err.message : 'Tente novamente.')
    } finally { setBusy(false) }
  }
  const note = unchanged ? 'Este é o seu nome de usuário atual.' : problem ?? (checking ? 'Verificando disponibilidade…' : entry?.text ?? '')
  const good = !unchanged && !problem && entry?.result?.available
  return <View>
    <Text className={tw.body}>Seu @ é único, aparece mesmo com a conta privada e tem de 3 a 30 caracteres: letras minúsculas, números, ponto e sublinhado, sem ponto no início, no fim ou repetido.</Text>
    <Field label="Nome de usuário" value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false} maxLength={31} placeholder="seu.usuario" editable={!busy} />
    {note ? <Text accessibilityLiveRegion="polite" className={good ? tw.success : tw.error}>{note}</Text> : null}
    {entry?.result?.suggestions.length ? <View className={tw.row}>{entry.result.suggestions.map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Usar ${item}`} onPress={() => setValue(item)} className={cx(tw.chip.base, tw.chip.idle)}><Text className={tw.chipText.idle}>@{item}</Text></Pressable>)}</View> : null}
    {error ? <Text accessibilityRole="alert" className={tw.error}>{error}</Text> : null}
    <Button title={busy ? 'Salvando…' : 'Salvar nome de usuário'} disabled={busy || Boolean(problem) || unchanged || unavailable || checking} onPress={() => void save()} />
  </View>
}
