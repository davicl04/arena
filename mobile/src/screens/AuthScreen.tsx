import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../components/Text'
import { ApiError, request, saveToken } from '../api/client'
import type { User } from '../api/client'
import { ActionButton, FormField, Notice } from '../components/arena/controls'
import { AuthBrandBand } from '../components/auth/AuthBrandBand'
import { toast } from '../components/toast/toastStore'
import { colors, darkColors } from '../theme'

const modes = [{ register: false, label: 'Entrar' }, { register: true, label: 'Criar conta' }] as const

/**
 * Tela de entrada (Dividida estreita): a faixa da marca no topo e o formulário escuro abaixo, iguais nos dois temas.
 * `notice`: avisos que vêm do aplicativo (sessão expirada, falha de conexão), entre o subtítulo e o seletor.
 * `onConnectionFailure`: entrar ou criar conta falhou por conexão; o aplicativo liga o bloco "Não foi possível conectar" e o formulário não repete a mensagem.
 */
export default function AuthScreen({ onLogin, onConnectionFailure, notice }: { onLogin: (user: User) => void; onConnectionFailure: (cause: ApiError) => void; notice?: ReactNode }) {
  const [register, setRegister] = useState(false)
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setError('')
    if (!email.trim() || !password || (register && (!name.trim() || !/^\d{2}\/\d{2}\/\d{4}$/.test(birth)))) {
      setError('Preencha os campos. Use DD/MM/AAAA para a data de nascimento.'); return
    }
    if (register && password.length < 10) { setError('A senha deve ter pelo menos 10 caracteres.'); return }
    setBusy(true)
    try {
      if (register) {
        await request('/auth/register', 'POST', { name, email: email.trim(), password, birth_date: birth.split('/').reverse().join('-') })
        setRegister(false); setPassword(''); toast.success('Conta criada.', { description: 'Entre com seu e-mail e senha.' }); return
      }
      const session = await request<{ user: User; token: string }>('/auth/login', 'POST', { email: email.trim(), password })
      await saveToken(session.token); onLogin(session.user)
    } catch (err) {
      if (err instanceof ApiError && err.isConnection) onConnectionFailure(err)
      else setError(err instanceof Error ? err.message : 'Tente novamente.')
    }
    finally { setBusy(false) }
  }
  function choose(next: boolean) {
    if (next === register) return
    setRegister(next); setError(''); setPassword('')
  }
  return <>
    <AuthBrandBand register={register} />
    <View testID="auth-form" style={{ paddingHorizontal: 20, paddingTop: 26 }}>
      <Text style={{ color: darkColors.eyebrow, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' }}>Bem-vindo à Arena</Text>
      <Text accessibilityRole="header" style={{ marginTop: 6, color: '#ffffff', fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 }}>{register ? 'Comece sua jornada' : 'Bom ter você aqui'}</Text>
      <Text style={{ marginTop: 4, color: darkColors['ink-muted'], fontSize: 13.5, lineHeight: 20 }}>{register ? 'Uma conta. Três maneiras de se movimentar.' : 'Entre para cuidar do seu perfil esportivo.'}</Text>
      {notice}
      <View style={{ marginTop: 20, flexDirection: 'row', gap: 4, borderRadius: 12, padding: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}>
        {modes.map(mode => {
          const selected = mode.register === register
          return <Pressable key={mode.label} accessibilityRole="button" accessibilityLabel={mode.label} accessibilityState={{ selected, disabled: busy }} disabled={busy}
            onPress={() => choose(mode.register)}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: selected ? colors.legend : 'transparent' }}>
            <Text style={{ color: selected ? '#1a1404' : 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '700' }}>{mode.label}</Text>
          </Pressable>
        })}
      </View>
      {register ? <>
        <FormField surface="dark" label="Nome completo" value={name} onChangeText={setName} editable={!busy} autoComplete="name" maxLength={100} />
        <FormField surface="dark" label="Data de nascimento (DD/MM/AAAA)" hint="A Arena é para pessoas com 18 anos completos ou mais." value={birth} onChangeText={setBirth} editable={!busy} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" maxLength={10} />
      </> : null}
      <FormField surface="dark" label="E-mail" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} />
      <FormField surface="dark" label={register ? 'Senha (10 a 128 caracteres)' : 'Senha'} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete={register ? 'new-password' : 'current-password'} maxLength={128} />
      {error ? <Notice tone="error" surface="dark">{error}</Notice> : null}
      <View style={{ marginTop: 22 }}>
        <ActionButton tone="mint" block title={busy ? 'Aguarde…' : register ? 'Criar minha conta' : 'Entrar na Arena'} busy={busy} onPress={() => void submit()} />
      </View>
      <Text style={{ marginTop: 16, textAlign: 'center', color: darkColors['ink-muted'], fontSize: 11.5, lineHeight: 18 }}>Seu perfil começa privado. Você controla os dados da sua trajetória.</Text>
    </View>
  </>
}
