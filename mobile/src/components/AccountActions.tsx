import { useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../api/client'
import type { SocialUser } from '../api/client'
import { blockUser } from '../api/social'
import GlassOverlay, { GlassRow, glass } from './GlassOverlay'
import ReportForm from './ReportForm'
import { Avatar } from './media'
import { Button } from './ui'

type Step = 'menu' | 'block' | 'report'

/** Ações da conta visitada em vidro de tela cheia: Bloquear (com confirmação) e Denunciar conta. */
export default function AccountActions({ person, token, onClose, onBlocked, onExpired }: {
  person: SocialUser; token: string | null; onClose: () => void; onBlocked: () => void; onExpired: () => void
}) {
  const [step, setStep] = useState<Step>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function go(next: Step) { setError(''); setStep(next) }
  async function block() {
    if (busy) return
    setBusy(true); setError('')
    try { await blockUser(person.id); onBlocked() }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível bloquear a conta.'); setBusy(false) }
  }
  const title = step === 'block' ? 'Bloquear conta' : step === 'report' ? 'Denunciar conta' : 'Ações da conta'
  return <GlassOverlay variant="screen" title={title} onClose={onClose} onBack={step === 'menu' || busy ? undefined : () => go('menu')}>
    {step === 'menu' ? <>
      <View style={{ alignItems: 'center', gap: 4, marginVertical: 16 }}>
        <Avatar path={person.avatar_url} name={person.name} token={token} size={64} />
        <Text style={{ color: glass.text, fontSize: 17, fontWeight: '700' }}>@{person.username}</Text>
        <Text style={{ color: glass.muted }}>{person.name}</Text>
      </View>
      <GlassRow label="Bloquear" onPress={() => go('block')} />
      <GlassRow danger label="Denunciar conta" onPress={() => go('report')} />
    </> : null}
    {step === 'block' ? <View>
      <Text style={{ color: glass.text, fontSize: 16, fontWeight: '700' }}>Bloquear @{person.username}?</Text>
      <Text style={{ color: glass.muted, lineHeight: 20, marginTop: 6 }}>Os vínculos atuais são removidos e esta conta deixa de ver seu perfil. Você pode desbloquear depois em Contas bloqueadas.</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: glass.danger, marginTop: 8 }}>{error}</Text> : null}
      <Button title={busy ? 'Bloqueando…' : 'Confirmar bloqueio'} disabled={busy} onPress={() => void block()} />
      <Button secondary title="Cancelar" disabled={busy} onPress={() => go('menu')} />
    </View> : null}
    {step === 'report' ? <ReportForm target="user" targetId={person.id} title="Por que você quer denunciar esta conta?" onDone={onClose} onExpired={onExpired} /> : null}
  </GlassOverlay>
}
