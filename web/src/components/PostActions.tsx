import { useState } from 'react'
import type { FormEvent } from 'react'
import { Flag, Pencil, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import type { Post } from '../api/client'
import { CAPTION_MAX, deletePost, updateCaption } from '../api/social'
import ReportForm from './ReportForm'
import { Button } from '@/components/ui/button'
import { Glass, GlassActions, GlassChoice, GlassChoices, GlassConfirm, GlassTextarea } from '@/components/ui/glass'
import { glassMessageVariants } from '@/components/ui/glass-variants'

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

  return <Glass key={step} variant="media" label={titles[step]} title={step === 'menu' ? undefined : titles[step]}
    onClose={onClose} onBack={step === 'menu' ? undefined : () => go('menu')}>
    {step === 'menu' && <GlassChoices>
      {post.can_edit ? <>
        <GlassChoice type="button" icon={<Pencil size={22} />} onClick={() => go('edit')}>Editar legenda</GlassChoice>
        <GlassChoice type="button" danger icon={<Trash2 size={22} />} onClick={() => go('delete')}>Excluir</GlassChoice>
      </> : <GlassChoice type="button" danger icon={<Flag size={22} />} onClick={() => go('report')}>Denunciar</GlassChoice>}
    </GlassChoices>}
    {step === 'edit' && <form className="grid gap-2" onSubmit={event => void save(event)}>
      <label className="sr-only" htmlFor={`caption-${post.id}`}>Legenda</label>
      <GlassTextarea id={`caption-${post.id}`} className="min-h-24" data-autofocus value={caption} maxLength={CAPTION_MAX} rows={4}
        aria-describedby={`caption-count-${post.id}`} onChange={event => setCaption(event.target.value)} />
      <GlassActions>
        <small id={`caption-count-${post.id}`} className="flex-1 text-[10px] text-[#ffffffa6] tabular-nums">{caption.length}/{CAPTION_MAX}</small>
        <Button type="button" variant="glass-secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="glass" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
      </GlassActions>
    </form>}
    {step === 'delete' && <GlassConfirm question="Excluir publicação?" actions={<>
      <Button type="button" variant="glass-secondary" data-autofocus onClick={() => go('menu')}>Cancelar</Button>
      <Button type="button" variant="glass-danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Excluir'}</Button>
    </>}>A foto, as curtidas e os comentários saem do perfil. Não dá para desfazer.</GlassConfirm>}
    {step === 'report' && <ReportForm target="post" targetId={post.id} onSent={onReported} onExpired={onExpired} />}
    {error && <p className={glassMessageVariants()} role="alert">{error}</p>}
  </Glass>
}
