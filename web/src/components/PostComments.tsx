import { useState } from 'react'
import type { FormEvent } from 'react'
import { Flag, SendHorizontal, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import type { Post, SocialComment } from '../api/client'
import { COMMENT_MAX, createComment, deleteComment } from '../api/social'
import { usePagedList } from '../hooks/usePagedList'
import ReportForm from './ReportForm'
import { SocialPhoto } from './SocialPhoto'
import { Button, IconButton } from '@/components/ui/button'
import { Glass } from '@/components/ui/glass'
import { glassMessageVariants } from '@/components/ui/glass-variants'

/* Texto do comentário (lista e citação na denúncia). */
const commentText = 'text-[11.5px] leading-[1.45] wrap-anywhere'
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
    return <Glass key="report" variant="media" label="Denunciar comentário" title="Denunciar comentário"
      onClose={onClose} onBack={() => setReporting(null)} backLabel="Voltar aos comentários">
      <blockquote className="m-0 flex items-start gap-2 rounded-xl bg-[#ffffff14] px-2.5 py-[9px]">
        <SocialPhoto path={reporting.author_avatar_url} name={reporting.author_name} size="comment" />
        <p className={commentText}><b>{reporting.author_name}</b> {reporting.body}</p>
      </blockquote>
      <ReportForm target="comment" targetId={reporting.id} onExpired={onExpired}
        onSent={() => { setReporting(null); setNotice('Denúncia do comentário enviada para análise.') }} />
    </Glass>
  }

  return <Glass key="list" variant="media" label="Comentários" title="Comentários" badge={post.comment_count}
    closeLabel="Fechar comentários" onClose={onClose} bodyClassName="overflow-hidden">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none]">
      {notice && <p className={glassMessageVariants({ tone: 'notice' })} role="status">{notice}</p>}
      {list.loading ? <p className={glassMessageVariants({ tone: 'muted' })} role="status">Carregando comentários…</p>
        : list.error ? <p className={glassMessageVariants()} role="alert">{list.error.message} <Button type="button" variant="glass-link" onClick={list.reload}>Tentar novamente</Button></p>
          : list.items.length === 0 ? <p className={glassMessageVariants({ tone: 'muted' })}>Nenhum comentário ainda. Escreva o primeiro.</p>
            : <ul className="m-0 grid list-none gap-0.5 p-0">
              {list.items.map(comment => <li key={comment.id} className="flex items-start gap-[9px] py-[7px]">
                <SocialPhoto path={comment.author_avatar_url} name={comment.author_name} size="comment" />
                <div className="min-w-0 flex-1"><p className={commentText}><b>{comment.author_name}</b> {comment.body}</p><small className="mt-0.5 text-[9.5px] text-[#ffffff99]">{when(comment.created_at)}</small></div>
                {comment.author_id !== viewerId && <IconButton type="button" tone="glass-small" aria-label={`Denunciar comentário de ${comment.author_name}`}
                  onClick={() => { setNotice(''); setReporting(comment) }}><Flag size={14} /></IconButton>}
                {comment.can_delete && <IconButton type="button" tone="glass-small" aria-label={`Excluir comentário de ${comment.author_name}`}
                  disabled={busy} onClick={() => void remove(comment)}><Trash2 size={14} /></IconButton>}
              </li>)}
            </ul>}
      {list.moreError && <p className={glassMessageVariants()} role="alert">{list.moreError}</p>}
      {list.hasMore && <Button type="button" variant="glass-link" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais comentários</Button>}
    </div>
    {error && <p className={glassMessageVariants()} role="alert">{error}</p>}
    <form className="flex shrink-0 items-center gap-2" onSubmit={event => void send(event)}>
      <label className="sr-only" htmlFor={`comment-${post.id}`}>Escreva um comentário</label>
      <input id={`comment-${post.id}`} className="min-h-[38px] flex-1 rounded-[19px] border-[#ffffff33] bg-[#ffffff1a] px-[13px] py-0 text-[11.5px] text-white placeholder:text-[#ffffff99] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint" value={draft} maxLength={COMMENT_MAX} autoComplete="off"
        placeholder="Adicione um comentário…" onChange={event => setDraft(event.target.value)} />
      <IconButton type="submit" tone="send" aria-label="Enviar comentário" disabled={busy || !draft.trim()}><SendHorizontal size={17} /></IconButton>
    </form>
  </Glass>
}
