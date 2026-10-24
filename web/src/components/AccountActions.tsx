import { useState } from 'react'
import { Ban, Flag } from 'lucide-react'
import type { SocialUser } from '../api/client'
import { blockUser } from '../api/social'
import ReportForm from './ReportForm'
import { SocialPhoto } from './SocialPhoto'
import { useSubmit } from '../hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { Glass, GlassChoice, GlassChoices, GlassConfirm } from '@/components/ui/glass'

type Step = 'menu' | 'block' | 'report'
const titles: Record<Step, string> = { menu: 'Ações da conta', block: 'Bloquear conta', report: 'Denunciar conta' }

/** Ações da conta visitada em vidro de tela inteira: bloquear (com confirmação) ou denunciar. */
export default function AccountActions({ person, onClose, onBlocked, onReported, onExpired }: {
  person: SocialUser
  onClose: () => void
  onBlocked: () => void
  onReported: () => void
  onExpired: () => void
}) {
  const [step, setStep] = useState<Step>('menu')
  // Falha ao bloquear: toast de erro (ou aviso de conexão), pelo useSubmit.
  const { busy, run } = useSubmit(onExpired)

  function go(next: Step) { setStep(next) }
  async function block() {
    if (busy) return
    const done = await run(async () => { await blockUser(person.id); return true }, 'Não foi possível bloquear a conta.')
    if (done) onBlocked()
  }

  return <Glass key={step} variant="screen" label={titles[step]} title={step === 'menu' ? undefined : titles[step]}
    onClose={onClose} onBack={step === 'menu' ? undefined : () => go('menu')}>
    {step === 'menu' && <>
      <div className="mx-0 mt-auto mb-[26px] grid justify-items-center gap-1 text-center">
        <SocialPhoto path={person.avatar_url} name={person.name} size="lg" />
        <b className="font-display text-[15px] font-bold wrap-anywhere">@{person.username}</b>
        <small className="text-[11px] text-[#ffffffa6]">{person.name}</small>
      </div>
      <GlassChoices className="mt-0">
        <GlassChoice type="button" icon={<Ban size={22} />} onClick={() => go('block')}>Bloquear</GlassChoice>
        <GlassChoice type="button" danger icon={<Flag size={22} />} onClick={() => go('report')}>Denunciar conta</GlassChoice>
      </GlassChoices>
    </>}
    {step === 'block' && <GlassConfirm question={<>Bloquear @{person.username}?</>} actions={<>
      <Button type="button" variant="glass-secondary" data-autofocus onClick={() => go('menu')}>Cancelar</Button>
      <Button type="button" variant="glass-danger" disabled={busy} onClick={() => void block()}>{busy ? 'Bloqueando…' : 'Bloquear'}</Button>
    </>}>Os vínculos atuais são removidos e esta conta deixa de ver seu perfil. Você pode desbloquear depois em Contas bloqueadas.</GlassConfirm>}
    {step === 'report' && <ReportForm target="user" targetId={person.id} title="Por que você quer denunciar esta conta?" onSent={onReported} onExpired={onExpired} />}
  </Glass>
}
