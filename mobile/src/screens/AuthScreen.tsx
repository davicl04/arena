import { useState } from 'react'
import { Text, View } from 'react-native'
import { request, saveToken } from '../api/client'
import type { User } from '../api/client'
import { Button, Field, styles } from '../components/ui'

export default function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false)
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit() {
    setError(''); setMessage('')
    if (!email.trim() || !password || (register && (!name.trim() || !/^\d{2}\/\d{2}\/\d{4}$/.test(birth)))) {
      setError('Preencha os campos. Use DD/MM/AAAA para a data de nascimento.'); return
    }
    if (register && password.length < 10) { setError('A senha deve ter pelo menos 10 caracteres.'); return }
    setBusy(true)
    try {
      if (register) {
        await request('/auth/register', 'POST', { name, email: email.trim(), password, birth_date: birth.split('/').reverse().join('-') })
        setRegister(false); setPassword(''); setMessage('Conta criada. Entre com seu e-mail e senha.'); return
      }
      const session = await request<{ user: User; token: string }>('/auth/login', 'POST', { email: email.trim(), password })
      await saveToken(session.token); onLogin(session.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'Tente novamente.') }
    finally { setBusy(false) }
  }
  return <><Text style={styles.eyebrow}>SEU ESPORTE, SUA HISTÓRIA</Text><Text style={styles.title}>Encontre seu próximo começo.</Text><Text style={styles.body}>Futebol, tênis e corrida. Sua trajetória começa aqui.</Text><View style={styles.card}><Text style={styles.heading}>{register ? 'Crie sua conta' : 'Bom ter você aqui'}</Text>
    {register ? <><Field label="Nome completo" value={name} onChangeText={setName} editable={!busy} autoComplete="name" maxLength={100} /><Field label="Data de nascimento (DD/MM/AAAA)" value={birth} onChangeText={setBirth} editable={!busy} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" maxLength={10} /><Text style={styles.body}>Para pessoas com 18 anos completos ou mais.</Text></> : null}
    <Field label="E-mail" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} />
    <Field label={register ? 'Senha (10 a 128 caracteres)' : 'Senha'} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete={register ? 'new-password' : 'current-password'} maxLength={128} />
    {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}{message ? <Text style={styles.success} accessibilityLiveRegion="polite">{message}</Text> : null}
    <Button title={busy ? 'Aguarde…' : register ? 'Criar minha conta' : 'Entrar no Arena'} onPress={() => void submit()} disabled={busy} />
    <Button secondary title={register ? 'Já tenho conta' : 'Criar conta'} disabled={busy} onPress={() => { setRegister(v => !v); setError(''); setMessage(''); setPassword('') }} />
  </View><Text style={styles.body}>Seu perfil começa privado.</Text></>
}
