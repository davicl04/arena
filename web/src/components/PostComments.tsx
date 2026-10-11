import { useState } from 'react'
import type { FormEvent } from 'react'
import { Flag, SendHorizontal, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import type { Post, SocialComment } from '../api/client'
import { COMMENT_MAX, createComment, deleteComment } from '../api/social'
import { usePagedList } from '../hooks/usePagedList'
import GlassPanel from './GlassPanel'
import ReportForm from './ReportForm'
import { SocialPhoto } from './SocialPhoto'

const when = (value: string) => new Date(value).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Comentários no vidro sobre a foto (C4), com envio por ícone e denúncia de comentários de outras pessoas. */
export default function PostComments({ post, viewerId, onClose, onCountChange, onExpired }: {
  post: Post
  viewerId: number
  onClose: () => void
  onCountChange: (delta: number) => void
  onExpired: () => void
}) {
  const list = usePagedList<SocialComment>(`/posts/${post.id}/comments`, onExpired)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reporting, setReporting] = useState<SocialComment | null>(null)

  function fail(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
    setError(cause instanceof Error && cause.message ? cause.message : fallback)
  }
  async function send(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const added = await createComment(post.id, body)
      // A API lista do mais recente para o mais antigo.
      list.setItems(old => [added, ...old])
      onCountChange(1)
      setDraft('')
    } catch (cause) { fail(cause, 'Não foi possível publicar o comentário.') } finally { setBusy(false) }
  }
  async function remove(comment: SocialComment) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await deleteComment(comment.id)
      list.setItems(old => old.filter(item => item.id !== comment.id))
      onCountChange(-1)
    } catch (cause) { fail(cause, 'Não foi possível excluir o comentário.') } finally { setBusy(false) }
  }

  if (reporting) {
    return <GlassPanel key="report" variant="media" label="Denunciar comentário" title="Denunciar comentário" className="post-comment-report"
      onClose={onClose} onBack={() => setReporting(null)} backLabel="Voltar aos comentários">
      <blockquote className="comment-quote"><SocialPhoto path={reporting.author_avatar_url} name={reporting.author_name} /><p><b>{reporting.author_name}</b> {reporting.body}</p></blockquote>
      <ReportForm target="comment" targetId={reporting.id} onExpired={onExpired}
        onSent={() => { setReporting(null); setNotice('Denúncia do comentário enviada para análise.') }} />
    </GlassPanel>
  }

  return <GlassPanel key="list" variant="media" label="Comentários" title="Comentários" badge={post.comment_count}
    closeLabel="Fechar comentários" onClose={onClose} className="post-comments">
    <div className="comment-scroll">
      {notice && <p className="glass-notice" role="status">{notice}</p>}
      {list.loading ? <p className="glass-muted" role="status">Carregando comentários…</p>
        : list.error ? <p className="glass-error" role="alert">{list.error.message} <button type="button" className="glass-link" onClick={list.reload}>Tentar novamente</button></p>
          : list.items.length === 0 ? <p className="glass-muted">Nenhum comentário ainda. Escreva o primeiro.</p>
            : <ul className="comment-list">
              {list.items.map(comment => <li key={comment.id}>
                <SocialPhoto path={comment.author_avatar_url} name={comment.author_name} />
                <div><p><b>{comment.author_name}</b> {comment.body}</p><small>{when(comment.created_at)}</small></div>
                {comment.author_id !== viewerId && <button type="button" className="comment-action" aria-label={`Denunciar comentário de ${comment.author_name}`}
                  onClick={() => { setNotice(''); setReporting(comment) }}><Flag size={14} /></button>}
                {comment.can_delete && <button type="button" className="comment-action" aria-label={`Excluir comentário de ${comment.author_name}`}
                  disabled={busy} onClick={() => void remove(comment)}><Trash2 size={14} /></button>}
              </li>)}
            </ul>}
      {list.moreError && <p className="glass-error" role="alert">{list.moreError}</p>}
      {list.hasMore && <button type="button" className="glass-link" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais comentários</button>}
    </div>
    {error && <p className="glass-error" role="alert">{error}</p>}
    <form className="comment-form" onSubmit={event => void send(event)}>
      <label className="visually-hidden" htmlFor={`comment-${post.id}`}>Escreva um comentário</label>
      <input id={`comment-${post.id}`} value={draft} maxLength={COMMENT_MAX} autoComplete="off"
        placeholder="Adicione um comentário…" onChange={event => setDraft(event.target.value)} />
      <button type="submit" className="comment-send" aria-label="Enviar comentário" disabled={busy || !draft.trim()}><SendHorizontal size={17} /></button>
    </form>
  </GlassPanel>
}
