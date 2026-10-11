import { useState } from 'react'
import { Ban, Flag } from 'lucide-react'
import { ApiError } from '../api/client'
import type { SocialUser } from '../api/client'
import { blockUser } from '../api/social'
import GlassPanel from './GlassPanel'
import ReportForm from './ReportForm'
import { SocialPhoto } from './SocialPhoto'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function go(next: Step) { setError(''); setStep(next) }
  async function block() {
    if (busy) return
    setBusy(true); setError('')
    try { await blockUser(person.id); onBlocked() }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível bloquear a conta.')
      setBusy(false)
    }
  }

  return <GlassPanel key={step} variant="screen" label={titles[step]} title={step === 'menu' ? undefined : titles[step]}
    onClose={onClose} onBack={step === 'menu' ? undefined : () => go('menu')} className="account-actions">
    {step === 'menu' && <>
      <div className="glass-who">
        <SocialPhoto path={person.avatar_url} name={person.name} />
        <b>@{person.username}</b>
        <small>{person.name}</small>
      </div>
      <div className="glass-choices">
        <button type="button" onClick={() => go('block')}><span><Ban size={22} /></span>Bloquear</button>
        <button type="button" className="danger" onClick={() => go('report')}><span><Flag size={22} /></span>Denunciar conta</button>
      </div>
    </>}
    {step === 'block' && <div className="glass-confirm">
      <p className="glass-question">Bloquear @{person.username}?</p>
      <p>Os vínculos atuais são removidos e esta conta deixa de ver seu perfil. Você pode desbloquear depois em Contas bloqueadas.</p>
      <div className="glass-actions">
        <button type="button" className="glass-secondary" data-autofocus onClick={() => go('menu')}>Cancelar</button>
        <button type="button" className="glass-primary danger" disabled={busy} onClick={() => void block()}>{busy ? 'Bloqueando…' : 'Bloquear'}</button>
      </div>
    </div>}
    {step === 'report' && <ReportForm target="user" targetId={person.id} title="Por que você quer denunciar esta conta?" onSent={onReported} onExpired={onExpired} />}
    {error && <p className="glass-error" role="alert">{error}</p>}
  </GlassPanel>
}
