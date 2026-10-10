import type { FormEvent } from 'react'
import { Heart, MessageCircle } from 'lucide-react'
import { apiUrl } from '../api/client'
import type { Post, SocialComment } from '../api/client'

export function SocialPhoto({ path, name, className = '' }: { path: string | null; name: string; className?: string }) {
  return path ? <img className={className} src={apiUrl(path)} alt={`Foto de ${name}`} /> :
    <span className={`social-avatar social-initials ${className}`} aria-label={name}>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
}

interface Props {
  post: Post
  comments: SocialComment[]
  open: boolean
  draft: string
  busy: boolean
  commentCursor: string | null
  onOpenProfile: (id: number) => void
  onEditCaption: (post: Post) => void
  onRemovePost: (post: Post) => void
  onReport: (type: string, id: number) => void
  onToggleLike: (post: Post) => void
  onToggleComments: (post: Post) => void
  onSendComment: (event: FormEvent, post: Post) => void
  onDraftChange: (id: number, value: string) => void
  onDeleteComment: (post: Post, comment: SocialComment) => void
  onLoadComments: (post: Post) => void
}

export default function SocialPostCard({ post, comments, open, draft, busy, commentCursor,
  onOpenProfile, onEditCaption, onRemovePost, onReport, onToggleLike, onToggleComments,
  onSendComment, onDraftChange, onDeleteComment, onLoadComments }: Props) {
  return <article className="social-post">
    <header className="social-post-author">
      <button className="social-author-link" onClick={() => onOpenProfile(post.author.id)}><SocialPhoto path={post.author.avatar_url} name={post.author.name} /><span><b>{post.author.name}</b><small>{new Date(post.created_at).toLocaleString('pt-BR')}</small></span></button>
      <details className="social-menu"><summary aria-label="Ações da publicação">•••</summary><div>
        {post.can_edit && <><button onClick={() => onEditCaption(post)}>Editar legenda</button><button onClick={() => onRemovePost(post)}>Excluir publicação</button></>}
        {!post.can_edit && <button onClick={() => onReport('post', post.id)}>Denunciar</button>}
      </div></details>
    </header>
    <img className="social-post-image" src={apiUrl(post.image_url)} alt={post.caption || `Publicação de ${post.author.name}`} />
    {post.caption && <p className="social-caption"><b>{post.author.name}</b> {post.caption}</p>}
    <div className="social-actions">
      <button aria-pressed={post.liked_by_me} onClick={() => onToggleLike(post)}><Heart size={19} fill={post.liked_by_me ? 'currentColor' : 'none'} /> Curtir · {post.like_count}</button>
      <button aria-expanded={open} onClick={() => onToggleComments(post)}><MessageCircle size={19} /> Comentários · {post.comment_count}</button>
    </div>
    {open && <section className="social-comments" aria-label="Comentários">
      {comments.map(comment => <article className="social-comment" key={comment.id}>
        <SocialPhoto path={comment.author_avatar_url} name={comment.author_name} />
        <p><b>{comment.author_name}</b> {comment.body}</p>
        {comment.can_delete ? <button aria-label="Excluir comentário" onClick={() => onDeleteComment(post, comment)}>×</button> : <button aria-label="Denunciar comentário" onClick={() => onReport('comment', comment.id)}>!</button>}
      </article>)}
      {commentCursor && <button className="text-button" disabled={busy} onClick={() => onLoadComments(post)}>Carregar mais comentários</button>}
      <form className="social-comment-form" onSubmit={event => onSendComment(event, post)}><label className="visually-hidden" htmlFor={`comment-${post.id}`}>Escreva um comentário</label><input id={`comment-${post.id}`} value={draft} maxLength={1000} onChange={event => onDraftChange(post.id, event.target.value)} placeholder="Adicione um comentário…" /><button className="text-button" disabled={busy || !draft.trim()}>Publicar</button></form>
    </section>}
  </article>
}
