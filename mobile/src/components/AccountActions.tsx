import { useState } from 'react'
import { Text, View } from 'react-native'
import type { SocialUser } from '../api/client'
import { blockUser } from '../api/social'
import { reportActionError } from '../hooks/useSubmit'
import GlassOverlay, { GlassRow } from './GlassOverlay'
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
  function go(next: Step) { setStep(next) }
  async function block() {
    if (busy) return
    setBusy(true)
    try { await blockUser(person.id); onBlocked() }
    catch (err) { reportActionError(err, 'Não foi possível bloquear a conta.', onExpired); setBusy(false) }
  }
  const title = step === 'block' ? 'Bloquear conta' : step === 'report' ? 'Denunciar conta' : 'Ações da conta'
  return <GlassOverlay variant="screen" title={title} onClose={onClose} onBack={step === 'menu' || busy ? undefined : () => go('menu')}>
    {step === 'menu' ? <>
      <View className="my-4 items-center gap-1">
        <Avatar path={person.avatar_url} name={person.name} token={token} size={64} />
        <Text className="text-[17px] font-bold text-white">@{person.username}</Text>
        <Text className="text-glass-muted">{person.name}</Text>
      </View>
      <GlassRow label="Bloquear" onPress={() => go('block')} />
      <GlassRow danger label="Denunciar conta" onPress={() => go('report')} />
    </> : null}
    {step === 'block' ? <View>
      <Text className="text-[16px] font-bold text-white">Bloquear @{person.username}?</Text>
      <Text className="mt-1.5 leading-[20px] text-glass-muted">Os vínculos atuais são removidos e esta conta deixa de ver seu perfil. Você pode desbloquear depois em Contas bloqueadas.</Text>
      <Button title={busy ? 'Bloqueando…' : 'Confirmar bloqueio'} disabled={busy} onPress={() => void block()} />
      <Button secondary title="Cancelar" disabled={busy} onPress={() => go('menu')} />
    </View> : null}
    {step === 'report' ? <ReportForm target="user" targetId={person.id} title="Por que você quer denunciar esta conta?" onDone={onClose} onExpired={onExpired} /> : null}
  </GlassOverlay>
}
