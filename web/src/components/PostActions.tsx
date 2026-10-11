import { useState } from 'react'
import type { FormEvent } from 'react'
import { Flag, Pencil, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import type { Post } from '../api/client'
import { CAPTION_MAX, deletePost, updateCaption } from '../api/social'
import GlassPanel from './GlassPanel'
import ReportForm from './ReportForm'

type Step = 'menu' | 'edit' | 'delete' | 'report'
const titles: Record<Step, string> = { menu: 'Ações da publicação', edit: 'Editar legenda', delete: 'Excluir publicação', report: 'Denunciar publicação' }

/** Menu ••• no vidro sobre a foto (M3): o dono edita a legenda ou exclui; quem visita denuncia. */
export default function PostActions({ post, onClose, onChange, onRemoved, onReported, onExpired }: {
  post: Post
  onClose: () => void
  onChange: (post: Post) => void
  onRemoved: (postId: number) => void
  onReported: () => void
  onExpired: () => void
}) {
  const [step, setStep] = useState<Step>('menu')
  const [caption, setCaption] = useState(post.caption)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function go(next: Step) { setError(''); setStep(next) }
  function fail(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
    setError(cause instanceof Error && cause.message ? cause.message : fallback)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { onChange(await updateCaption(post.id, caption)); onClose() }
    catch (cause) { fail(cause, 'Não foi possível salvar a legenda.'); setBusy(false) }
  }
  async function remove() {
    if (busy) return
    setBusy(true); setError('')
    try { await deletePost(post.id); onRemoved(post.id) }
    catch (cause) { fail(cause, 'Não foi possível excluir a publicação.'); setBusy(false) }
  }

  return <GlassPanel key={step} variant="media" label={titles[step]} title={step === 'menu' ? undefined : titles[step]}
    onClose={onClose} onBack={step === 'menu' ? undefined : () => go('menu')} className="post-actions">
    {step === 'menu' && <div className="glass-choices">
      {post.can_edit ? <>
        <button type="button" onClick={() => go('edit')}><span><Pencil size={22} /></span>Editar legenda</button>
        <button type="button" className="danger" onClick={() => go('delete')}><span><Trash2 size={22} /></span>Excluir</button>
      </> : <button type="button" className="danger" onClick={() => go('report')}><span><Flag size={22} /></span>Denunciar</button>}
    </div>}
    {step === 'edit' && <form className="caption-form" onSubmit={event => void save(event)}>
      <label className="visually-hidden" htmlFor={`caption-${post.id}`}>Legenda</label>
      <textarea id={`caption-${post.id}`} data-autofocus value={caption} maxLength={CAPTION_MAX} rows={4}
        aria-describedby={`caption-count-${post.id}`} onChange={event => setCaption(event.target.value)} />
      <div className="glass-actions">
        <small id={`caption-count-${post.id}`}>{caption.length}/{CAPTION_MAX}</small>
        <button type="button" className="glass-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="glass-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>}
    {step === 'delete' && <div className="glass-confirm">
      <p className="glass-question">Excluir publicação?</p>
      <p>A foto, as curtidas e os comentários saem do perfil. Não dá para desfazer.</p>
      <div className="glass-actions">
        <button type="button" className="glass-secondary" data-autofocus onClick={() => go('menu')}>Cancelar</button>
        <button type="button" className="glass-primary danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Excluir'}</button>
      </div>
    </div>}
    {step === 'report' && <ReportForm target="post" targetId={post.id} onSent={onReported} onExpired={onExpired} />}
    {error && <p className="glass-error" role="alert">{error}</p>}
  </GlassPanel>
}
